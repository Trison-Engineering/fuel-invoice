import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_PORTAL_IP,
  EZPUMP_EMAIL,
  EZPUMP_IP,
  EZPUMP_PASSWORD,
} from "../../utils/storage";
import { isValidPortalIp } from "../../utils/validation";
import { syncStationRatesFromEzPump } from "./syncStationRatesFromEzPump";

const FETCH_TIMEOUT_MS = 8000;

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

let sessionCookies = "";
let cachedRates: EzPumpRates | null = null;
const RATES_CACHE_TTL = 10 * 60 * 1000;

async function getPortalHost(): Promise<string> {
  const stored = (await AsyncStorage.getItem(EZPUMP_IP))?.trim();
  const host = stored || DEFAULT_PORTAL_IP;
  if (!isValidPortalIp(host)) {
    throw new Error("PORTAL_IP_NOT_SET");
  }
  return host;
}

async function getBaseUrl(): Promise<string> {
  const host = await getPortalHost();
  return `http://${host}`;
}

async function getCredentials(): Promise<{ email: string; password: string }> {
  const email = await AsyncStorage.getItem(EZPUMP_EMAIL);
  const password = await AsyncStorage.getItem(EZPUMP_PASSWORD);

  if (!email || !password) {
    throw new Error("CREDENTIALS_NOT_SET");
  }

  return { email, password };
}

function extractField(html: string, label: string): string {
  const liPattern = new RegExp(
    label + "[\\s\\S]*?<\\/b>[\\s\\S]*?<span>([\\s\\S]*?)<\\/span>",
    "i"
  );
  const match = html.match(liPattern);
  return match ? match[1].trim() : "";
}

function parseCookiePair(pair: string): [string, string] | null {
  const trimmed = pair.trim();
  if (!trimmed) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;
  return [trimmed.slice(0, eq), trimmed.slice(eq + 1)];
}

function mergeCookies(existing: string, setCookieHeaders: string[]): string {
  const cookieMap = new Map<string, string>();

  if (existing) {
    for (const part of existing.split(";")) {
      const parsed = parseCookiePair(part);
      if (parsed) cookieMap.set(parsed[0], parsed[1]);
    }
  }

  for (const header of setCookieHeaders) {
    const parsed = parseCookiePair(header.split(";")[0]);
    if (parsed) cookieMap.set(parsed[0], parsed[1]);
  }

  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const raw = (headers as Headers & { raw?: () => Record<string, string[]> }).raw?.();
  if (raw?.["set-cookie"]) {
    return raw["set-cookie"];
  }

  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function updateSessionCookies(response: Response): void {
  const setCookies = getSetCookieHeaders(response);
  if (setCookies.length > 0) {
    sessionCookies = mergeCookies(sessionCookies, setCookies);
  }
}

function getXsrfToken(): string {
  const match = sessionCookies.match(/XSRF-TOKEN=([^;]+)/);
  if (!match) return "";
  return decodeURIComponent(match[1]);
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("NETWORK_UNAVAILABLE");
    }
    throw new Error("NETWORK_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

function extractCsrfToken(html: string): string {
  const patterns = [
    /<input[^>]*name="_token"[^>]*value="([^"]+)"/i,
    /<input[^>]*value="([^"]+)"[^>]*name="_token"/i,
    /name="_token"\s+value="([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }

  throw new Error("AUTH_FAILED");
}

async function getLoginToken(): Promise<string> {
  const baseUrl = await getBaseUrl();
  const response = await fetchWithTimeout(`${baseUrl}/login`);
  updateSessionCookies(response);
  const html = await response.text();
  return extractCsrfToken(html);
}

async function login(csrfToken: string): Promise<void> {
  const baseUrl = await getBaseUrl();
  const { email, password } = await getCredentials();

  const body = new URLSearchParams({
    _token: csrfToken,
    email,
    password,
    remember: "on",
  }).toString();

  const response = await fetchWithTimeout(`${baseUrl}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: sessionCookies,
      "X-XSRF-TOKEN": getXsrfToken(),
      Referer: `${baseUrl}/login`,
      Origin: baseUrl,
    },
    body,
    redirect: "manual",
  });

  updateSessionCookies(response);

  if (response.status !== 200 && response.status !== 302) {
    throw new Error("AUTH_FAILED");
  }
}

function parseSaleRow(chunk: string): Omit<EzPumpSale, "officialRate" | "calculatedRate"> | null {
  const idMatch =
    chunk.match(/name="id"\s+value="(\d+)"/) ??
    chunk.match(/name="id"\s+value='(\d+)'/);
  const productMatch =
    chunk.match(/name="product"\s+value="([^"]+)"/) ??
    chunk.match(/name="product"\s+value='([^']+)'/);

  if (!idMatch) return null;

  return {
    id: idMatch[1].trim(),
    product: (productMatch?.[1] ?? "").trim(),
    date: extractField(chunk, "Date:"),
    qty: extractField(chunk, "Qty:"),
    amount: extractField(chunk, "Amount:"),
    nozzleId: extractField(chunk, "Nozel ID:"),
    payment: extractField(chunk, "Payment:"),
    customer: extractField(chunk, "Customer:"),
    vehicle: extractField(chunk, "Vehicle:"),
  };
}

function isLoginPage(html: string, saleCount: number): boolean {
  return saleCount === 0 && /login/i.test(html) && html.includes("Login");
}

function parseRatesFromHtml(html: string): Omit<EzPumpRates, "fetchedAt"> {
  function extractPrice(productName: string): number | null {
    const pattern = new RegExp(
      `<strong>${productName}<\\/strong>[\\s\\S]{0,300}<b>Rs\\.\\s*([\\d,]+\\.?\\d*)<\\/b>`,
      "i"
    );
    const match = html.match(pattern);
    if (match && match[1]) {
      return parseFloat(match[1].replace(/,/g, ""));
    }
    return null;
  }

  return {
    petrol: extractPrice("Petrol"),
    hiOctane: extractPrice("HiOctane"),
    diesel: extractPrice("Diesel"),
  };
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

export function clearEzPumpSession(): void {
  sessionCookies = "";
  clearRatesCache();
}

export function getRatesFromCache(): EzPumpRates | null {
  return cachedRates;
}

export async function fetchRates(retryAfterLogin = true): Promise<EzPumpRates> {
  if (
    cachedRates &&
    Date.now() - cachedRates.fetchedAt < RATES_CACHE_TTL
  ) {
    return cachedRates;
  }

  const baseUrl = await getBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/Rates`, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Referer: `${baseUrl}/`,
        Cookie: sessionCookies,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    updateSessionCookies(response);

    if (!response.ok) {
      throw new Error("RATES_FETCH_FAILED");
    }

    const html = await response.text();

    if (html.includes("/login") && html.includes("form")) {
      if (retryAfterLogin) {
        const token = await getLoginToken();
        await login(token);
        return fetchRates(false);
      }
      throw new Error("SESSION_EXPIRED");
    }

    const rates = parseRatesFromHtml(html);
    cachedRates = { ...rates, fetchedAt: Date.now() };

    syncStationRatesFromEzPump(cachedRates).catch((err) =>
      console.warn("[EzPump] syncStationRatesFromEzPump failed:", err)
    );

    return cachedRates;
  } catch (error: unknown) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("NETWORK_UNAVAILABLE");
    }
    throw error;
  }
}

function enrichSalesWithRates(
  sales: Omit<EzPumpSale, "officialRate" | "calculatedRate">[],
  rates: EzPumpRates
): EzPumpSale[] {
  return sales.map((sale) => {
    let officialRate: number | null = null;

    const product = sale.product?.toLowerCase() || "";

    if (product.includes("petrol")) {
      officialRate = rates.petrol;
    } else if (
      product.includes("hioctane") ||
      product.includes("hi-octane") ||
      product.includes("hi octane")
    ) {
      officialRate = rates.hiOctane;
    } else if (product.includes("diesel")) {
      officialRate = rates.diesel;
    }

    return {
      ...sale,
      officialRate,
      calculatedRate:
        sale.qty && parseFloat(sale.qty) > 0
          ? parseFloat(
              (parseFloat(sale.amount) / parseFloat(sale.qty)).toFixed(2)
            )
          : null,
    };
  });
}

async function fetchDataframe(): Promise<Omit<EzPumpSale, "officialRate" | "calculatedRate">[]> {
  const baseUrl = await getBaseUrl();
  const response = await fetchWithTimeout(`${baseUrl}/dataframe`, {
    headers: {
      Cookie: sessionCookies,
      Referer: `${baseUrl}/`,
    },
  });

  updateSessionCookies(response);
  const html = await response.text();
  const chunks = html.split('class="card new_sale_id mb-3 saleRow');
  const sales: Omit<EzPumpSale, "officialRate" | "calculatedRate">[] = [];

  for (let i = 1; i < chunks.length; i++) {
    const sale = parseSaleRow(chunks[i]);
    if (sale) sales.push(sale);
  }

  if (isLoginPage(html, sales.length)) {
    throw new Error("SESSION_EXPIRED");
  }

  return sales;
}

async function authenticateAndFetch(): Promise<
  Omit<EzPumpSale, "officialRate" | "calculatedRate">[]
> {
  const token = await getLoginToken();
  await login(token);
  return fetchDataframe();
}

async function getRecentSales(): Promise<EzPumpSale[]> {
  await getCredentials();

  let sales: Omit<EzPumpSale, "officialRate" | "calculatedRate">[];

  try {
    sales = await fetchDataframe();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";

    if (message === "CREDENTIALS_NOT_SET" || message === "PORTAL_IP_NOT_SET") {
      throw err;
    }

    if (message === "NETWORK_UNAVAILABLE") {
      throw err;
    }

    if (message === "SESSION_EXPIRED" || message === "AUTH_FAILED") {
      try {
        sales = await authenticateAndFetch();
      } catch (retryErr) {
        const retryMessage = retryErr instanceof Error ? retryErr.message : "";
        if (
          retryMessage === "NETWORK_UNAVAILABLE" ||
          retryMessage === "CREDENTIALS_NOT_SET" ||
          retryMessage === "PORTAL_IP_NOT_SET"
        ) {
          throw retryErr;
        }
        throw new Error("AUTH_FAILED");
      }
    } else {
      throw new Error("NETWORK_UNAVAILABLE");
    }
  }

  let rates: EzPumpRates = {
    petrol: null,
    hiOctane: null,
    diesel: null,
    fetchedAt: 0,
  };

  try {
    rates = await fetchRates();
  } catch (err) {
    console.warn("fetchRates failed:", err);
  }

  return enrichSalesWithRates(sales, rates);
}

export const EzPumpService = {
  getRecentSales,
  fetchRates,
  clearRatesCache,
  clearEzPumpSession,
  getRatesFromCache,
};
