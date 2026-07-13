import type { EzPumpSale } from "./EzPumpService";

const MOCK_RATES: Record<string, number> = {
  Petrol: 275.6,
  Diesel: 283.4,
  HiOctane: 312.9,
};

const PRODUCTS = ["Petrol", "Diesel", "HiOctane"] as const;
const PAYMENTS = ["Cash", "Credit", "Card"] as const;

const CUSTOMERS = [
  "",
  "Walk-in",
  "Ali Traders",
  "Khan Transport",
  "City Logistics",
  "Malik & Sons",
  "Rapid Movers",
  "Bilal Enterprises",
];

const VEHICLE_PREFIXES = ["ABC", "LEA", "KHI", "RIK", "LHR", "ISB", "GB", "AJK"];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function makeVehicle(): string {
  if (Math.random() < 0.3) return "";
  return `${pick(VEHICLE_PREFIXES)}-${randomInt(100, 9999)}`;
}

function formatMockDate(date: Date): string {
  const day = date.getDate();
  const month = MONTHS_SHORT[date.getMonth()];
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${day} ${month} ${year}, ${String(hours12).padStart(2, "0")}:${minutes} ${period}`;
}

/**
 * Generates a batch of 20-30 fake sales that mirror the exact shape returned by
 * the EzPump /dataframe endpoint (after rate enrichment). Used for demoing the
 * live feed without a real portal connection.
 */
export function generateMockSales(): EzPumpSale[] {
  const count = randomInt(20, 30);
  const now = Date.now();
  const sales: EzPumpSale[] = [];

  for (let i = 0; i < count; i++) {
    const product = pick(PRODUCTS);
    const officialRate = MOCK_RATES[product] ?? null;
    const qtyNum = parseFloat((Math.random() * 60 + 2).toFixed(2));
    const rateForAmount = officialRate ?? 270;
    const amountNum = parseFloat((qtyNum * rateForAmount).toFixed(2));
    const calculatedRate =
      qtyNum > 0 ? parseFloat((amountNum / qtyNum).toFixed(2)) : null;

    const saleDate = new Date(now - i * randomInt(30, 300) * 1000);

    sales.push({
      id: String(now - i),
      product,
      date: formatMockDate(saleDate),
      qty: qtyNum.toFixed(2),
      amount: amountNum.toFixed(2),
      nozzleId: String(randomInt(1, 8)),
      payment: pick(PAYMENTS),
      customer: pick(CUSTOMERS),
      vehicle: makeVehicle(),
      officialRate,
      calculatedRate,
    });
  }

  return sales;
}
