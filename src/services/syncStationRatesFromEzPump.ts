import { useStationStore } from "../../stores/stationStore";
import type { EzPumpRates } from "./EzPumpService";
import { recordPriceChange } from "./PriceHistoryService";

type FuelKey = "petrol" | "diesel" | "hiOctane";
type ProductLabel = "PETROL" | "DIESEL" | "HI-OCTANE";

const RATE_FIELDS: Array<{
  key: FuelKey;
  product: ProductLabel;
  getRate: (rates: EzPumpRates) => number | null;
}> = [
  { key: "petrol", product: "PETROL", getRate: (r) => r.petrol },
  { key: "diesel", product: "DIESEL", getRate: (r) => r.diesel },
  { key: "hiOctane", product: "HI-OCTANE", getRate: (r) => r.hiOctane },
];

function formatRate(rate: number): string {
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(2);
}

/** Push EzPump API rates into station profile (Settings fuel prices) and persist. */
export async function syncStationRatesFromEzPump(rates: EzPumpRates): Promise<boolean> {
  const store = useStationStore.getState();
  if (!store.isHydrated) return false;

  let changed = false;

  for (const { key, product, getRate } of RATE_FIELDS) {
    const rate = getRate(rates);
    if (rate == null || rate <= 0) continue;

    const newPrice = formatRate(rate);
    const oldPrice = store.fuelPrices[key];
    if (oldPrice === newPrice) continue;

    const oldNumeric = parseFloat(oldPrice);
    if (!isNaN(oldNumeric) && oldNumeric > 0 && Math.abs(oldNumeric - rate) > 0.001) {
      await recordPriceChange(product, oldNumeric, rate);
    }

    switch (key) {
      case "petrol":
        store.setPetrolPrice(newPrice);
        break;
      case "diesel":
        store.setDieselPrice(newPrice);
        break;
      case "hiOctane":
        store.setHiOctanePrice(newPrice);
        break;
    }
    changed = true;
  }

  if (changed) {
    await useStationStore.getState().saveProfile();
  }

  return changed;
}
