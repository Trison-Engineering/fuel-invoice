import AsyncStorage from "@react-native-async-storage/async-storage";
import { EZPUMP_EMAIL, EZPUMP_PASSWORD } from "../../utils/storage";

const BASE_URL = "http://192.168.0.100";

const FETCH_TIMEOUT_MS = 8000;

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
}

let sessionCookies = "";

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
  const response = await fetchWithTimeout(`${BASE_URL}/login`);
  updateSessionCookies(response);
  const html = await response.text();
  return extractCsrfToken(html);
}

async function login(csrfToken: string): Promise<void> {
  const { email, password } = await getCredentials();

  const body = new URLSearchParams({
    _token: csrfToken,
    email,
    password,
    remember: "on",
  }).toString();

  const response = await fetchWithTimeout(`${BASE_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: sessionCookies,
      "X-XSRF-TOKEN": getXsrfToken(),
      Referer: `${BASE_URL}/login`,
      Origin: BASE_URL,
    },
    body,
    redirect: "manual",
  });

  updateSessionCookies(response);

  if (response.status !== 200 && response.status !== 302) {
    throw new Error("AUTH_FAILED");
  }
}

function parseSaleRow(chunk: string): EzPumpSale | null {
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

async function fetchDataframe(): Promise<EzPumpSale[]> {
  const response = await fetchWithTimeout(`${BASE_URL}/dataframe`, {
    headers: {
      Cookie: sessionCookies,
      Referer: `${BASE_URL}/`,
    },
  });

  updateSessionCookies(response);
  const html = await response.text();
  const chunks = html.split('class="card new_sale_id mb-3 saleRow');
  const sales: EzPumpSale[] = [];

  for (let i = 1; i < chunks.length; i++) {
    const sale = parseSaleRow(chunks[i]);
    if (sale) sales.push(sale);
  }

  if (isLoginPage(html, sales.length)) {
    throw new Error("SESSION_EXPIRED");
  }

  return sales;
}

async function authenticateAndFetch(): Promise<EzPumpSale[]> {
  const token = await getLoginToken();
  await login(token);
  return fetchDataframe();
}

async function getRecentSales(): Promise<EzPumpSale[]> {
  await getCredentials();

  try {
    return await fetchDataframe();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";

    if (message === "CREDENTIALS_NOT_SET") {
      throw err;
    }

    if (message === "NETWORK_UNAVAILABLE") {
      throw err;
    }

    if (message === "SESSION_EXPIRED" || message === "AUTH_FAILED") {
      try {
        return await authenticateAndFetch();
      } catch (retryErr) {
        const retryMessage = retryErr instanceof Error ? retryErr.message : "";
        if (
          retryMessage === "NETWORK_UNAVAILABLE" ||
          retryMessage === "CREDENTIALS_NOT_SET"
        ) {
          throw retryErr;
        }
        throw new Error("AUTH_FAILED");
      }
    }

    throw new Error("NETWORK_UNAVAILABLE");
  }
}

export const EzPumpService = {
  getRecentSales,
};
