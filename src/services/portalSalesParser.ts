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

/** Brand labels differ per station (GO: Petrol/HOBC/Diesel, PSO: Premier/Octane+/Hi-Cetane). */
function canonicalProduct(label: string, labelToIcode: Map<string, string>): string {
  const icode = labelToIcode.get(label.toLowerCase());
  if (icode && ICODE_TO_PRODUCT[icode]) return ICODE_TO_PRODUCT[icode];

  const p = label.toLowerCase();
  if (p.includes("diesel") || p.includes("cetane") || p.includes("hsd")) return "Diesel";
  if (p.includes("octane") || p.includes("hobc")) return "HiOctane";
  if (p.includes("petrol") || p.includes("premier") || p.includes("super")) return "Petrol";
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

/** Station id from a portal URL like /portal/s/6/ or the first site link on /portal/cluster/. */
export function findStationId(url: string, html: string): string | null {
  const fromUrl = url.match(/\/portal\/s\/(\d+)\//);
  if (fromUrl) return fromUrl[1];
  const fromPage = html.match(/href="\/portal\/s\/(\d+)\/"/);
  return fromPage ? fromPage[1] : null;
}

export function extractCsrfMiddlewareToken(html: string): string | null {
  const match =
    html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/) ??
    html.match(/value="([^"]+)"\s+name="csrfmiddlewaretoken"/);
  return match ? match[1] : null;
}
