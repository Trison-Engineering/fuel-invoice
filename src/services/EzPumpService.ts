import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_PORTAL_URL,
  EZPUMP_EMAIL,
  EZPUMP_PASSWORD,
  PORTAL_STATION_ID,
  PORTAL_URL,
} from "../../utils/storage";
import {
  extractCsrfMiddlewareToken,
  findStationId,
  isPortalLoginPage,
  parsePortalSalesPage,
  type ParsedPortalSale,
} from "./portalSalesParser";
import { syncStationRatesFromEzPump } from "./syncStationRatesFromEzPump";

const FETCH_TIMEOUT_MS = 10000;
const VENDOR_CODE = "tepl";

export interface EzPumpRates {
  petrol: number | null;
  hiOctane: number | null;
  diesel: number | null;
  fetchedAt: number;
}

export interface EzPumpSale {
  id: string;
  product: string;
  date: string;
  qty: string;
  amount: string;
  nozzleId: string;
  payment: string;
  customer: string;
  vehicle: string;
  officialRate: number | null;
  calculatedRate: number | null;
}

/*
 * Fuelmatic portal (Django). Login sets the `fuelmatic_sid` session cookie, which the
 * native HTTP stack stores and resends (OkHttp cookie jar / NSHTTPCookieStorage) —
 * fetch follows redirects there, so JS never sees the 302 Set-Cookie itself. We keep
 * the station id the login redirect points at (/portal/s/<id>/) and re-login whenever a
 * request lands back on /login/.
 */

let stationId: string | null = null;
let cachedRates: EzPumpRates | null = null;
const RATES_CACHE_TTL = 10 * 60 * 1000;

export function normalizePortalUrl(value: string): string {
  let url = value.trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, "");
}

export function isValidPortalUrl(value: string): boolean {
  return /^https?:\/\/[^\s/?#]+(:\d+)?(\/[^\s]*)?$/i.test(normalizePortalUrl(value));
}

async function getBaseUrl(): Promise<string> {
  const stored = (await AsyncStorage.getItem(PORTAL_URL))?.trim();
  const url = normalizePortalUrl(stored || DEFAULT_PORTAL_URL);
  if (!isValidPortalUrl(url)) {
    throw new Error("PORTAL_URL_NOT_SET");
  }
  return url;
}

async function getCredentials(): Promise<{ email: string; password: string }> {
  const email = await AsyncStorage.getItem(EZPUMP_EMAIL);
  const password = await AsyncStorage.getItem(EZPUMP_PASSWORD);

  if (!email || !password) {
    throw new Error("CREDENTIALS_NOT_SET");
  }

  return { email, password };
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, { credentials: "include", ...options, signal: controller.signal });
  } catch {
    throw new Error("NETWORK_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

function landedOnLogin(response: Response): boolean {
  return /\/login\/?(\?|$)/.test(response.url ?? "");
}

/**
 * Logs in with the given credentials and returns the station id. Does not persist
 * anything, so Admin can verify credentials before saving them.
 */
export async function loginToPortal(
  portalUrl: string,
  email: string,
  password: string
): Promise<string> {
  const baseUrl = normalizePortalUrl(portalUrl);

  // /login/ redirects away while a session is active, so drop any previous one first.
  await fetchWithTimeout(`${baseUrl}/logout/`).catch(() => undefined);

  const loginPage = await fetchWithTimeout(`${baseUrl}/login/`);
  const csrfToken = extractCsrfMiddlewareToken(await loginPage.text());
  if (!csrfToken) {
    throw new Error("AUTH_FAILED");
  }

  const body = new URLSearchParams({
    csrfmiddlewaretoken: csrfToken,
    next: "",
    email: email.trim(),
    password,
    vendor_code: VENDOR_CODE,
  }).toString();

  const response = await fetchWithTimeout(`${baseUrl}/login/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${baseUrl}/login/`,
      Origin: baseUrl,
    },
    body,
  });

  const html = await response.text();
  if (response.status === 401 || landedOnLogin(response) || isPortalLoginPage(html)) {
    throw new Error("AUTH_FAILED");
  }

  const id = findStationId(response.url ?? "", html);
  if (!id) {
    throw new Error("STATION_NOT_FOUND");
  }
  return id;
}

async function login(): Promise<string> {
  const baseUrl = await getBaseUrl();
  const { email, password } = await getCredentials();
  const id = await loginToPortal(baseUrl, email, password);
  stationId = id;
  await AsyncStorage.setItem(PORTAL_STATION_ID, id);
  return id;
}

async function getStationId(): Promise<string> {
  if (stationId) return stationId;
  const stored = await AsyncStorage.getItem(PORTAL_STATION_ID);
  if (stored) {
    stationId = stored;
    return stored;
  }
  return login();
}

function toEzPumpSale(sale: ParsedPortalSale): EzPumpSale {
  const qty = parseFloat(sale.qty);
  const amount = parseFloat(sale.amount);
  return {
    id: sale.id,
    product: sale.product,
    date: sale.date,
    qty: sale.qty,
    amount: sale.amount,
    nozzleId: sale.nozzleId,
    payment: sale.payment,
    customer: sale.customer,
    vehicle: sale.vehicle,
    officialRate: sale.rate,
    calculatedRate: qty > 0 ? parseFloat((amount / qty).toFixed(2)) : null,
  };
}

/** Latest rate per product, taken from the newest sale of each product. */
function ratesFromSales(sales: EzPumpSale[]): EzPumpRates {
  const rates: EzPumpRates = { petrol: null, hiOctane: null, diesel: null, fetchedAt: Date.now() };
  for (const sale of sales) {
    const rate = sale.officialRate;
    if (rate == null) continue;
    if (sale.product === "Petrol" && rates.petrol == null) rates.petrol = rate;
    else if (sale.product === "HiOctane" && rates.hiOctane == null) rates.hiOctane = rate;
    else if (sale.product === "Diesel" && rates.diesel == null) rates.diesel = rate;
  }
  return rates;
}

function updateRatesCache(sales: EzPumpSale[]): void {
  const fresh = ratesFromSales(sales);
  // Keep rates for products that had no sale in this window.
  cachedRates = {
    petrol: fresh.petrol ?? cachedRates?.petrol ?? null,
    hiOctane: fresh.hiOctane ?? cachedRates?.hiOctane ?? null,
    diesel: fresh.diesel ?? cachedRates?.diesel ?? null,
    fetchedAt: fresh.fetchedAt,
  };

  syncStationRatesFromEzPump(cachedRates).catch((err) =>
    console.warn("[Portal] syncStationRatesFromEzPump failed:", err)
  );
}

async function fetchSalesPage(): Promise<EzPumpSale[]> {
  const baseUrl = await getBaseUrl();
  const id = await getStationId();
  const url = `${baseUrl}/portal/s/${id}/sales/`;

  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "*/*",
      "HX-Request": "true",
      "HX-Boosted": "true",
      "HX-Current-URL": `${baseUrl}/portal/s/${id}/`,
      Referer: `${baseUrl}/portal/s/${id}/`,
    },
  });

  const html = await response.text();
  if (landedOnLogin(response) || isPortalLoginPage(html)) {
    throw new Error("SESSION_EXPIRED");
  }

  const parsed = parsePortalSalesPage(html);
  if (!parsed) {
    // Station id no longer valid for this account (e.g. 403/404 page)
    throw new Error("SESSION_EXPIRED");
  }

  return parsed.map(toEzPumpSale);
}

async function getRecentSales(): Promise<EzPumpSale[]> {
  await getCredentials();

  let sales: EzPumpSale[];
  try {
    sales = await fetchSalesPage();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message !== "SESSION_EXPIRED" && message !== "AUTH_FAILED") {
      throw err;
    }

    try {
      await login();
      sales = await fetchSalesPage();
    } catch (retryErr) {
      const retryMessage = retryErr instanceof Error ? retryErr.message : "";
      if (
        retryMessage === "NETWORK_UNAVAILABLE" ||
        retryMessage === "CREDENTIALS_NOT_SET" ||
        retryMessage === "PORTAL_URL_NOT_SET"
      ) {
        throw retryErr;
      }
      throw new Error("AUTH_FAILED");
    }
  }

  updateRatesCache(sales);
  return sales;
}

export function getOfficialRateForProduct(
  product: string,
  rates: EzPumpRates
): number | null {
  const p = product?.toLowerCase() || "";
  if (p.includes("petrol")) return rates.petrol;
  if (
    p.includes("hioctane") ||
    p.includes("hi-octane") ||
    p.includes("hi octane")
  ) {
    return rates.hiOctane;
  }
  if (p.includes("diesel")) return rates.diesel;
  return null;
}

export function getEffectiveRate(sale: EzPumpSale): number | null {
  return sale.officialRate ?? sale.calculatedRate;
}

export function clearRatesCache(): void {
  cachedRates = null;
}

/** Forget the session; call after portal credentials change. */
export async function clearEzPumpSession(): Promise<void> {
  stationId = null;
  clearRatesCache();
  await AsyncStorage.removeItem(PORTAL_STATION_ID);
}

/** Remember the station id from a login that Admin already performed. */
export async function setPortalStationId(id: string): Promise<void> {
  stationId = id;
  await AsyncStorage.setItem(PORTAL_STATION_ID, id);
}

export function getRatesFromCache(): EzPumpRates | null {
  return cachedRates;
}

/** Rates come from the latest sale of each product on the portal's sales page. */
export async function fetchRates(): Promise<EzPumpRates> {
  if (cachedRates && Date.now() - cachedRates.fetchedAt < RATES_CACHE_TTL) {
    return cachedRates;
  }
  await getRecentSales();
  return cachedRates ?? { petrol: null, hiOctane: null, diesel: null, fetchedAt: Date.now() };
}

export const EzPumpService = {
  getRecentSales,
  fetchRates,
  clearRatesCache,
  clearEzPumpSession,
  getRatesFromCache,
};
