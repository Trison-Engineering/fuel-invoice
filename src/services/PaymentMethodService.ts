import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "payment_methods";
const MAX_NAME_LENGTH = 32;

export interface PaymentMethod {
  id: string;
  name: string;
  createdAt: string;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function sanitizePaymentMethodName(name: string): string {
  return normalizeName(name).slice(0, MAX_NAME_LENGTH);
}

export const getPaymentMethods = async (): Promise<PaymentMethod[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    const parsed: PaymentMethod[] = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        item.name.trim().length > 0
    );
  } catch {
    return [];
  }
};

export const addPaymentMethod = async (name: string): Promise<PaymentMethod> => {
  const sanitized = sanitizePaymentMethodName(name);
  if (!sanitized) {
    throw new Error("Payment method name is required");
  }

  const existing = await getPaymentMethods();
  const duplicate = existing.some(
    (item) => item.name.toLowerCase() === sanitized.toLowerCase()
  );
  if (duplicate) {
    throw new Error("This payment method already exists");
  }

  const method: PaymentMethod = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: sanitized,
    createdAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([method, ...existing]));
  return method;
};

export const deletePaymentMethod = async (id: string): Promise<void> => {
  const existing = await getPaymentMethods();
  const updated = existing.filter((item) => item.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};
