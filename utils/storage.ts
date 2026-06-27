import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "@fuel_receipt:";

export async function getItem<T>(key: string): Promise<T | null> {
  try {
    const value = await AsyncStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (value === null) return null;
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // silently fail — offline local storage
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  } catch {
    // silently fail
  }
}

export async function clearAll(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const appKeys = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
    if (appKeys.length > 0) {
      await AsyncStorage.multiRemove(appKeys);
    }
  } catch {
    // silently fail
  }
}

export const StorageKeys = {
  STATION_PROFILE: "station_profile",
  LAST_PRINTER_ID: "last_printer_id",
  LAST_PRINTER_NAME: "last_printer_name",
  PRINTER_MODE: "printer_mode",
  LAST_SERIAL_PATH: "last_serial_path",
  INCLUDE_LOGO_IN_PRINT: "include_logo_in_print",
  USE_TWO_LOGOS: "use_two_logos",
} as const;

export const EZPUMP_EMAIL = "@fuel_receipt:ezpump_email";
export const EZPUMP_PASSWORD = "@fuel_receipt:ezpump_password";
export const EZPUMP_IP = "@fuel_receipt:ezpump_ip";
export const DEFAULT_PORTAL_IP = "192.168.0.100";
export const LIVE_FEED_FILTER_ENABLED = "@fuel_receipt:live_feed_filter_enabled";
export const LIVE_FEED_FILTER_PRODUCT = "@fuel_receipt:live_feed_filter_product";
