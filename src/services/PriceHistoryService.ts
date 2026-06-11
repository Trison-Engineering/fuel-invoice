import AsyncStorage from "@react-native-async-storage/async-storage";

export interface PriceChange {
  id: string;
  product: "PETROL" | "DIESEL" | "HI-OCTANE";
  oldPrice: number;
  newPrice: number;
  changedAt: string;
}

export const recordPriceChange = async (
  product: string,
  oldPrice: number,
  newPrice: number
): Promise<void> => {
  const change: PriceChange = {
    id: Date.now().toString(),
    product: product as PriceChange["product"],
    oldPrice,
    newPrice,
    changedAt: new Date().toISOString(),
  };

  const existing = await AsyncStorage.getItem("price_history");
  const history: PriceChange[] = existing ? JSON.parse(existing) : [];

  history.unshift(change);

  if (history.length > 50) history.splice(50);

  await AsyncStorage.setItem("price_history", JSON.stringify(history));
};

export const getPriceHistory = async (): Promise<PriceChange[]> => {
  const data = await AsyncStorage.getItem("price_history");
  return data ? JSON.parse(data) : [];
};
