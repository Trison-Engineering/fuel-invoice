import { NativeModules, Platform } from "react-native";

export type PrinterNativeModule = {
  getDeviceType?: () => Promise<string>;
  initPrinter?: () => Promise<boolean>;
  isConnected?: () => Promise<boolean>;
  getPrinterStatus?: () => Promise<number | string>;
  printReceipt?: (
    logoBase64: string,
    storeName: string,
    address: string,
    dateTime: string,
    product: string,
    volume: string,
    rate: string,
    total: string,
    vehicleNo: string
  ) => Promise<boolean>;
  printTestLine?: () => Promise<boolean>;
  printHelloWorld?: () => Promise<boolean>;
  printHelloWorldRaw?: () => Promise<boolean>;
  printText?: (content: string, textFormat: object) => Promise<number>;
  printBitmapBase64?: (base64Data: string, align: number) => Promise<boolean>;
  paperOut?: (lines: number) => Promise<number>;
};

export function listPrinterNativeModuleKeys(): string[] {
  if (Platform.OS !== "android") return [];
  return Object.keys(NativeModules).filter(
    (key) =>
      key.toLowerCase().includes("print") ||
      key.toLowerCase().includes("sunmi") ||
      key.toLowerCase().includes("nyx") ||
      key.toLowerCase().includes("unified")
  );
}

export function hasNativePrinterModule(): boolean {
  return Boolean(
    NativeModules.SunmiPrinterModule || NativeModules.UnifiedPrinterModule
  );
}

export function logPrinterNativeModules(): void {
  if (Platform.OS !== "android") return;
  const keys = listPrinterNativeModuleKeys();
  console.log("=== AVAILABLE PRINTER NATIVE MODULES ===", keys);
  if (keys.length === 0) {
    console.warn(
      "No printer native modules found. Install a dev/production APK built with withUnifiedPrinter — Expo Go will not work."
    );
  }
}

export function getPrinterModule(): PrinterNativeModule {
  const module =
    (NativeModules.SunmiPrinterModule as PrinterNativeModule | undefined) ??
    (NativeModules.UnifiedPrinterModule as PrinterNativeModule | undefined) ??
    (NativeModules.PrinterModule as PrinterNativeModule | undefined) ??
    null;

  if (!module) {
    throw new Error(
      "Printer native module not found. Rebuild and install the APK (npm run build:apk). Expo Go cannot access Sunmi printer."
    );
  }

  return module;
}

export async function waitForPrinterConnection(maxAttempts = 8): Promise<boolean> {
  if (!hasNativePrinterModule()) return false;

  const printer = getPrinterModule();

  if (!printer.isConnected) {
    throw new Error("Printer module does not expose isConnected()");
  }

  if (printer.initPrinter) {
    await printer.initPrinter().catch(() => false);
  }

  for (let i = 0; i < maxAttempts; i++) {
    const connected = Boolean(await printer.isConnected());
    if (connected) return true;
    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return false;
}
