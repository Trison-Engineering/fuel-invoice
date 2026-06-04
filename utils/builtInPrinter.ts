import { NativeModules, Platform } from "react-native";
import SunmiPrinter from "@heasy/react-native-sunmi-printer";
import { bufferToBase64 } from "./generateReceipt";

const BUILT_IN_ID = "builtin-pos-printer";
const BUILT_IN_NAME = "Built-in POS Printer";

/** Sunmi AIDL: 1 = ready, 2 = busy, 4 = no paper, 5 = overheated */
const SUNMI_STATE_READY = 1;

export type InternalBackend = "sunmi" | "printerModule";

type GenericPrinterModule = {
  printText?: (text: string) => void | Promise<void>;
  printRaw?: (data: string) => void | Promise<void>;
  sendRAWData?: (data: string) => void;
  hasPrinter?: () => Promise<boolean>;
  printerInit?: () => void;
  updatePrinterState?: () => Promise<number>;
  getServiceVersion?: () => Promise<string>;
};

let activeBackend: InternalBackend | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGenericPrinterModule(): GenericPrinterModule | null {
  const modules = NativeModules as Record<string, GenericPrinterModule | undefined>;
  return modules.PrinterModule ?? modules.PosPrinter ?? modules.IPosPrinter ?? null;
}

function prependUtf8Init(buffer: Uint8Array): Uint8Array {
  // ESC @ init + FS & (UTF-8 on many Chinese OEM POS printers)
  const prefix = new Uint8Array([0x1b, 0x40, 0x1c, 0x26]);
  const merged = new Uint8Array(prefix.length + buffer.length);
  merged.set(prefix);
  merged.set(buffer, prefix.length);
  return merged;
}

export function isSunmiPrinterModuleAvailable(): boolean {
  return Platform.OS === "android" && NativeModules.SunmiPrinter != null;
}

export function isGenericPrinterModuleAvailable(): boolean {
  return Platform.OS === "android" && getGenericPrinterModule() != null;
}

export function isInternalPrinterModuleAvailable(): boolean {
  return isSunmiPrinterModuleAvailable() || isGenericPrinterModuleAvailable();
}

export function getActiveInternalBackend(): InternalBackend | null {
  return activeBackend;
}

export function getBuiltInPrinterId(): string {
  return BUILT_IN_ID;
}

export function getBuiltInPrinterName(): string {
  return BUILT_IN_NAME;
}

async function isSunmiReady(): Promise<boolean> {
  if (!isSunmiPrinterModuleAvailable()) return false;
  try {
    return await SunmiPrinter.hasPrinter();
  } catch {
    return false;
  }
}

async function isGenericReady(): Promise<boolean> {
  const module = getGenericPrinterModule();
  if (!module?.hasPrinter) return false;
  try {
    return await module.hasPrinter();
  } catch {
    return !!module.printText || !!module.sendRAWData || !!module.printRaw;
  }
}

export async function isBuiltInPrinterReady(): Promise<boolean> {
  if (activeBackend === "sunmi") return isSunmiReady();
  if (activeBackend === "printerModule") return isGenericReady();
  return (await isSunmiReady()) || (await isGenericReady());
}

async function connectSunmi(maxAttempts = 20): Promise<boolean> {
  if (!isSunmiPrinterModuleAvailable()) return false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const ready = await SunmiPrinter.hasPrinter();
      if (ready) {
        activeBackend = "sunmi";
        return true;
      }
    } catch {
      // printer service may still be binding
    }
    await delay(500);
  }

  return false;
}

async function connectGeneric(maxAttempts = 10): Promise<boolean> {
  const module = getGenericPrinterModule();
  if (!module) return false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (module.hasPrinter) {
        const ready = await module.hasPrinter();
        if (!ready) {
          await delay(400);
          continue;
        }
      }
      activeBackend = "printerModule";
      return true;
    } catch {
      // service may still be binding
    }
    await delay(400);
  }

  if (module.printText || module.sendRAWData || module.printRaw) {
    activeBackend = "printerModule";
    return true;
  }

  return false;
}

export async function connectBuiltInPrinter(): Promise<boolean> {
  if (!isInternalPrinterModuleAvailable()) return false;

  activeBackend = null;

  if (await connectSunmi()) return true;
  if (await connectGeneric()) return true;

  return false;
}

export async function getBuiltInPrinterInfo(): Promise<{
  model?: string;
  paper?: string;
  version?: string;
  serviceVersion?: string;
  backend?: InternalBackend;
}> {
  try {
    if (activeBackend === "sunmi" || (await isSunmiReady())) {
      const [model, paper, version, serviceVersion] = await Promise.all([
        SunmiPrinter.getPrinterModal().catch(() => undefined),
        SunmiPrinter.getPrinterPaper().catch(() => undefined),
        SunmiPrinter.getPrinterVersion().catch(() => undefined),
        SunmiPrinter.getServiceVersion().catch(() => undefined),
      ]);
      return { model, paper, version, serviceVersion, backend: "sunmi" };
    }

    const module = getGenericPrinterModule();
    if (module?.getServiceVersion) {
      const serviceVersion = await module.getServiceVersion().catch(() => undefined);
      return { serviceVersion, backend: "printerModule" };
    }
  } catch {
    // ignore
  }
  return { backend: activeBackend ?? undefined };
}

export async function checkBuiltInPrinterStatus(): Promise<{
  ready: boolean;
  message: string;
}> {
  if (!activeBackend) {
    return { ready: false, message: "Internal printer not connected" };
  }

  if (activeBackend === "sunmi") {
    try {
      const ready = await SunmiPrinter.hasPrinter();
      if (!ready) {
        return { ready: false, message: "Internal printer service not connected" };
      }
      const state = await SunmiPrinter.updatePrinterState();
      if (state === SUNMI_STATE_READY) {
        return { ready: true, message: "Printer ready" };
      }
      const messages: Record<number, string> = {
        2: "Printer is busy",
        3: "Printer communication error",
        4: "Out of paper",
        5: "Printer overheated",
        6: "Cover open",
        7: "Cutter error",
      };
      return {
        ready: false,
        message: messages[state] ?? `Printer status code: ${state}`,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to read printer status";
      return { ready: false, message };
    }
  }

  const module = getGenericPrinterModule();
  if (module?.updatePrinterState) {
    try {
      const state = await module.updatePrinterState();
      if (state === SUNMI_STATE_READY || state === 0) {
        return { ready: true, message: "Printer ready" };
      }
      return { ready: false, message: `Printer status code: ${state}` };
    } catch {
      return { ready: true, message: "Printer ready (status unavailable)" };
    }
  }

  return { ready: true, message: "Printer ready" };
}

export async function printBuiltInRaw(buffer: Uint8Array): Promise<void> {
  const ready = await isBuiltInPrinterReady();
  if (!ready) {
    throw new Error("Internal printer service not connected");
  }

  const payload = prependUtf8Init(buffer);
  const base64 = bufferToBase64(payload);

  if (activeBackend === "sunmi" || (activeBackend === null && isSunmiPrinterModuleAvailable())) {
    try {
      SunmiPrinter.sendRAWData(base64);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sunmi print failed";
      throw new Error(message);
    }
    return;
  }

  const module = getGenericPrinterModule();
  if (!module) {
    throw new Error("No internal printer module available");
  }

  if (module.sendRAWData) {
    module.sendRAWData(base64);
    return;
  }
  if (module.printRaw) {
    await module.printRaw(base64);
    return;
  }

  throw new Error("Internal printer module does not support raw ESC/POS output");
}

export function generateTestReceiptBuffer(): Uint8Array {
  const LF = 0x0a;
  const ESC = 0x1b;
  const GS = 0x1d;
  const lines = [
    "FUEL RECEIPT TEST",
    "------------------------",
    "Connection: OK",
    "Paper: 58mm",
    "Charset: UTF-8",
    "------------------------",
    "If you can read this,",
    "printing is working.",
  ];

  const parts: number[] = [ESC, 0x40, 0x1c, 0x26, ESC, 0x61, 1];
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      parts.push(line.charCodeAt(i));
    }
    parts.push(LF);
  }
  parts.push(ESC, 0x64, 4, GS, 0x56, 0x00);
  return new Uint8Array(parts);
}
