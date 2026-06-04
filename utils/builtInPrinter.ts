import { NativeModules, Platform } from "react-native";
import { bufferToBase64 } from "./generateReceipt";
import {
  checkPosAidlPrinterStatus,
  connectPosAidlPrinter,
  disconnectPosAidlPrinter,
  getPosAidlBackend,
  isPosAidlPrinterModuleAvailable,
  isPosAidlPrinterReady,
  printPosAidlRaw,
} from "./posAidlPrinter";

const BUILT_IN_ID = "builtin-pos-printer";
const BUILT_IN_NAME = "Built-in POS Printer";

export type InternalBackend = "ipos" | "printerModule";

type GenericPrinterModule = {
  printText?: (text: string) => void | Promise<void>;
  printRaw?: (data: string) => void | Promise<void>;
  sendRAWData?: (data: string) => void;
  hasPrinter?: () => Promise<boolean>;
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

export function isGenericPrinterModuleAvailable(): boolean {
  return Platform.OS === "android" && getGenericPrinterModule() != null;
}

export function isInternalPrinterModuleAvailable(): boolean {
  return isPosAidlPrinterModuleAvailable() || isGenericPrinterModuleAvailable();
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
  if (activeBackend === "ipos") return isPosAidlPrinterReady();
  if (activeBackend === "printerModule") return isGenericReady();
  return (await isPosAidlPrinterReady()) || (await isGenericReady());
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
  await disconnectPosAidlPrinter().catch(() => undefined);

  if (await connectPosAidlPrinter()) {
    activeBackend = "ipos";
    return true;
  }
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
    if (activeBackend === "ipos" || (await isPosAidlPrinterReady())) {
      const backend = getPosAidlBackend() ?? "ipos";
      return { backend: "ipos", serviceVersion: backend };
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

  if (activeBackend === "ipos") {
    return checkPosAidlPrinterStatus();
  }

  const module = getGenericPrinterModule();
  if (module?.updatePrinterState) {
    try {
      const state = await module.updatePrinterState();
      if (state === 1 || state === 0) {
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
  if (activeBackend === "ipos" || (await isPosAidlPrinterReady())) {
    await printPosAidlRaw(buffer);
    return;
  }

  const ready = await isBuiltInPrinterReady();
  if (!ready) {
    throw new Error("Internal printer service not connected");
  }

  const module = getGenericPrinterModule();
  if (!module) {
    throw new Error("No internal printer module available");
  }

  const base64 = bufferToBase64(
    new Uint8Array([0x1b, 0x40, 0x1c, 0x26, ...buffer])
  );

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

// Re-export for hooks that check Sunmi module availability
export function isSunmiPrinterModuleAvailable(): boolean {
  return isPosAidlPrinterModuleAvailable();
}
