import { NativeModules, Platform } from "react-native";

export function listPrinterNativeModuleKeys(): string[] {
  if (Platform.OS !== "android") return [];
  return Object.keys(NativeModules).filter(
    (key) =>
      key.toLowerCase().includes("bluetooth") ||
      key.toLowerCase().includes("sunmi")
  );
}

export function hasNativePrinterModule(): boolean {
  return Boolean(NativeModules.BluetoothManager && NativeModules.BluetoothEscposPrinter);
}

export function logPrinterNativeModules(): void {
  if (Platform.OS !== "android") return;
  const keys = listPrinterNativeModuleKeys();
  console.log("=== AVAILABLE PRINTER NATIVE MODULES ===", keys);
  if (!hasNativePrinterModule()) {
    console.warn(
      "BluetoothManager/BluetoothEscposPrinter not found. Rebuild the APK with EAS — Expo Go will not work."
    );
  }
}

export async function waitForPrinterConnection(maxAttempts = 8): Promise<boolean> {
  if (!hasNativePrinterModule()) return false;
  try {
    return await NativeModules.SunmiPrinterModule.isConnected();
  } catch {
    return true;
  }
}
