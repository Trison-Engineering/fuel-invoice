import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EzPumpSale } from "./EzPumpService";

const HISTORY_KEY = "@fuel_receipt:nozzle_sales_history";
const MAX_SALES = 5000;
const MAX_AGE_DAYS = 7;

export interface StoredNozzleSale extends EzPumpSale {
  storedAt: string;
}

function normalizeNozzleId(id: string): string {
  return String(id ?? "").trim();
}

function pruneByAge(sales: StoredNozzleSale[]): StoredNozzleSale[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
  return sales.filter((sale) => {
    const stored = new Date(sale.storedAt);
    return !Number.isNaN(stored.getTime()) && stored > cutoff;
  });
}

async function readAll(): Promise<StoredNozzleSale[]> {
  try {
    const data = await AsyncStorage.getItem(HISTORY_KEY);
    if (!data) return [];
    const parsed: StoredNozzleSale[] = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    const fresh = pruneByAge(parsed);
    if (fresh.length !== parsed.length) {
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(fresh));
    }
    return fresh;
  } catch {
    return [];
  }
}

async function writeAll(sales: StoredNozzleSale[]): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(sales));
}

/**
 * Merge matching nozzle sales into local history (by sale id).
 * Returns history filtered to the selected nozzle IDs, newest first.
 */
export async function upsertNozzleFilteredSales(
  incoming: EzPumpSale[],
  nozzleIds: string[]
): Promise<EzPumpSale[]> {
  const selected = new Set(
    nozzleIds.map(normalizeNozzleId).filter((id) => id.length > 0)
  );
  if (selected.size === 0) return [];

  const existing = await readAll();
  const byId = new Map(existing.map((sale) => [sale.id, sale]));
  const now = new Date().toISOString();

  for (const sale of incoming) {
    const nozzleId = normalizeNozzleId(sale.nozzleId);
    if (!selected.has(nozzleId)) continue;

    const prev = byId.get(sale.id);
    byId.set(sale.id, {
      ...sale,
      storedAt: prev?.storedAt ?? now,
    });
  }

  let merged = pruneByAge(Array.from(byId.values()));
  merged.sort((a, b) => {
    const aTime = new Date(a.storedAt).getTime();
    const bTime = new Date(b.storedAt).getTime();
    return bTime - aTime;
  });

  if (merged.length > MAX_SALES) {
    merged = merged.slice(0, MAX_SALES);
  }

  await writeAll(merged);

  return merged
    .filter((sale) => selected.has(normalizeNozzleId(sale.nozzleId)))
    .map(({ storedAt: _storedAt, ...sale }) => sale);
}

export async function getNozzleFilteredSales(
  nozzleIds: string[]
): Promise<EzPumpSale[]> {
  const selected = new Set(
    nozzleIds.map(normalizeNozzleId).filter((id) => id.length > 0)
  );
  if (selected.size === 0) return [];

  const all = await readAll();
  return all
    .filter((sale) => selected.has(normalizeNozzleId(sale.nozzleId)))
    .map(({ storedAt: _storedAt, ...sale }) => sale);
}

export async function clearNozzleSalesHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}
