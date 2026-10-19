/**
 * Pure parsers for the Fuelmatic station portal (/portal/s/<id>/sales/).
 * No React Native imports so they can be tested in plain Node.
 */

/** Row shape inside <script id="sales-json-partial">. Numbers are scaled by 100. */
interface PortalSaleJson {
  id: number;
  sale_ts_iso: string;
  qty: number;
  rate: number;
  amount: number;
  product_label: string;
  default_customer: string;
  default_payment: string;
  default_vehicle: string;
  reg_no: string;
}

export interface ParsedPortalSale {
  id: string;
  /** Canonical product: "Petrol" | "HiOctane" | "Diesel", or the portal label */
  product: string;
  date: string;
  qty: string;
  amount: string;
  nozzleId: string;
  payment: string;
  customer: string;
  vehicle: string;
  rate: number | null;
}

const ICODE_TO_PRODUCT: Record<string, string> = {
  "1": "Petrol",
  "2": "HiOctane",
  "3": "Diesel",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, "·")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize for matching: "Hi-Octane" / "hi octane" / "HiOctane" → "hioctane". */
function normalizeProductKey(label: string): string {
  return label.toLowerCase().replace(/[-_\s]+/g, "");
}

/**
 * Hi-Octane aliases from different station brands / portal labels:
 * HOBC, Hi-Octane, Hi Octane, Octane, Octane+, etc.
 * (Hi-Cetane is diesel — excluded via "cetane".)
 */
function isHiOctaneLabel(label: string): boolean {
  const p = normalizeProductKey(label);
  if (p.includes("hobc")) return true;
  if (p.includes("hioctane")) return true;
  if (p.includes("octane") && !p.includes("cetane")) return true;
  return false;
}

/** Map a portal product label (HOBC, Diesel, …) to a canonical app product. */
export function canonicalProductFromLabel(label: string): string {
  if (isHiOctaneLabel(label)) return "HiOctane";
  const p = label.toLowerCase();
  if (p.includes("diesel") || p.includes("cetane") || p.includes("hsd")) return "Diesel";
  if (p.includes("petrol") || p.includes("premier") || p.includes("super")) return "Petrol";
  return label;
}

/** Brand labels differ per station (GO: Petrol/HOBC/Diesel, PSO: Premier/Octane+/Hi-Cetane). */
function canonicalProduct(label: string, labelToIcode: Map<string, string>): string {
  // Prefer known label aliases so HOBC / Hi-Octane / Octane always map correctly
  // even when portal icode options differ by station.
  const fromLabel = canonicalProductFromLabel(label);
  if (fromLabel === "HiOctane" || fromLabel === "Diesel" || fromLabel === "Petrol") {
    return fromLabel;
  }

  const icode = labelToIcode.get(label.toLowerCase());
  if (icode && ICODE_TO_PRODUCT[icode]) return ICODE_TO_PRODUCT[icode];

  return label;
}

/** value -> label for every <option> inside the named <select>. */
function parseSelectOptions(html: string, selectName: string): Map<string, string> {
  const options = new Map<string, string>();
  const select = html.match(
    new RegExp(`<select[^>]*name="${selectName}"[^>]*>([\\s\\S]*?)<\\/select>`, "i")
  );
  if (!select) return options;

  const optionPattern = /<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi;
  let match: RegExpExecArray | null;
  while ((match = optionPattern.exec(select[1])) !== null) {
    if (match[1]) options.set(match[1], decodeEntities(match[2]));
  }
  return options;
}

/** sale id -> nozzle number, read from the transactions table (not present in the JSON). */
function parseNozzles(html: string): Map<string, string> {
  const nozzles = new Map<string, string>();
  const rowPattern =
    /data-sale-id="(\d+)"[\s\S]*?<td>[\s\S]*?<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/g;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(html)) !== null) {
    nozzles.set(match[1], decodeEntities(match[3]));
  }
  return nozzles;
}

function scaled(value: number): number {
  return (Number(value) || 0) / 100;
}

export function isPortalLoginPage(html: string): boolean {
  return /name="csrfmiddlewaretoken"/.test(html) && /name="vendor_code"/.test(html);
}

/** Returns null when the page has no sales JSON (e.g. a login page or an error page). */
export function parsePortalSalesPage(html: string): ParsedPortalSale[] | null {
  const jsonMatch = html.match(
    /<script id="sales-json-partial" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!jsonMatch) return null;

  let rows: PortalSaleJson[];
  try {
    rows = JSON.parse(jsonMatch[1]);
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;

  const labelToIcode = new Map<string, string>();
  for (const [icode, label] of parseSelectOptions(html, "icode")) {
    labelToIcode.set(label.toLowerCase(), icode);
  }
  const payments = parseSelectOptions(html, "payment_mode");
  const customers = parseSelectOptions(html, "customer_code");
  const nozzles = parseNozzles(html);

  return rows.map((row) => {
    const id = String(row.id);
    const customer = customers.get(row.default_customer) ?? "";
    const regNo = row.reg_no && row.reg_no !== "0" ? row.reg_no : "";
    const rate = scaled(row.rate);

    return {
      id,
      product: canonicalProduct(row.product_label ?? "", labelToIcode),
      date: row.sale_ts_iso,
      qty: scaled(row.qty).toFixed(2),
      amount: scaled(row.amount).toFixed(2),
      nozzleId: nozzles.get(id) ?? "",
      payment: payments.get(row.default_payment) ?? "",
      customer: /walk-in/i.test(customer) ? "" : customer,
      vehicle: (row.default_vehicle || regNo).trim(),
      rate: rate > 0 ? rate : null,
    };
  });
}

/** Site id encoded in the login email, e.g. "nabeel@sid13.com" -> "13". */
export function stationIdFromEmail(email: string): string | null {
  const match = email.match(/@sid(\d+)\b/i) ?? email.match(/sid(\d+)/i);
  return match ? String(Number(match[1])) : null;
}

/**
 * Station id after login: single-site accounts redirect to /portal/s/<id>/; multi-site
 * accounts land on /portal/cluster/, where we pick the site matching the email's sid
 * (falling back to the first site listed).
 */
export function findStationId(url: string, html: string, email = ""): string | null {
  const fromUrl = url.match(/\/portal\/s\/(\d+)\//);
  if (fromUrl) return fromUrl[1];

  const siteIds = Array.from(html.matchAll(/href="\/portal\/s\/(\d+)\/"/g), (m) => m[1]);
  if (siteIds.length === 0) return null;

  const preferred = stationIdFromEmail(email);
  if (preferred && siteIds.includes(preferred)) return preferred;
  return siteIds[0];
}

export function extractCsrfMiddlewareToken(html: string): string | null {
  const match =
    html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/) ??
    html.match(/value="([^"]+)"\s+name="csrfmiddlewaretoken"/);
  return match ? match[1] : null;
}
