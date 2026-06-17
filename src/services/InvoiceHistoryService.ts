import AsyncStorage from "@react-native-async-storage/async-storage";

const HISTORY_KEY = "invoice_history";
const MAX_INVOICES = 2000;
const MAX_AGE_DAYS = 7;

export interface StoredInvoice {
  id: string;
  printedAt: string;
  product: string;
  volume?: number | null;
  rate?: number | null;
  totalAmount: number;
  vehicleNo: string;
  stationName: string;
  address: string;
  dateTime: string;
  isDuplicate: boolean;
  lubricantName?: string;
}

export function formatSlipDateTime(date: Date = new Date()): string {
  return `${date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}  ${date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })}`;
}

export function productTypeToStorageKey(productType: string): string {
  const lower = productType.toLowerCase();
  if (lower.includes("diesel")) return "DIESEL";
  if (lower.includes("octane")) return "HI-OCTANE";
  if (lower.includes("lubricant")) return "LUBRICANTS";
  if (lower.includes("car service")) return "CAR SERVICE";
  return "PETROL";
}

export function storageKeyToProductType(product: string): string {
  if (product === "DIESEL") return "Diesel";
  if (product === "HI-OCTANE") return "Hi-Octane";
  if (product === "LUBRICANTS") return "Lubricants";
  if (product === "CAR SERVICE") return "Car Service";
  return "Petrol";
}

/** True for first-run prints; duplicates and legacy rows without the flag count as non-duplicate. */
export function isOriginalInvoice(invoice: StoredInvoice): boolean {
  return invoice.isDuplicate !== true;
}

export const getOriginalInvoices = async (): Promise<StoredInvoice[]> => {
  const invoices = await getInvoices();
  return invoices.filter(isOriginalInvoice);
};

export const saveInvoice = async (
  data: Omit<StoredInvoice, "id" | "printedAt">
): Promise<StoredInvoice> => {
  const invoice: StoredInvoice = {
    ...data,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    printedAt: new Date().toISOString(),
  };

  const existing = await getInvoices();
  const updated = [invoice, ...existing];

  if (updated.length > MAX_INVOICES) {
    updated.splice(MAX_INVOICES);
  }

  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));

  return invoice;
};

export const getInvoices = async (): Promise<StoredInvoice[]> => {
  try {
    const data = await AsyncStorage.getItem(HISTORY_KEY);
    if (!data) return [];

    const all: StoredInvoice[] = JSON.parse(data);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

    const fresh = all.filter((inv) => new Date(inv.printedAt) > cutoff);

    if (fresh.length !== all.length) {
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(fresh));
    }

    return fresh;
  } catch {
    return [];
  }
};

export const clearInvoiceHistory = async (): Promise<void> => {
  await AsyncStorage.removeItem(HISTORY_KEY);
};
