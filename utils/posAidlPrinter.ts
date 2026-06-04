import { NativeModules, Platform } from "react-native";
import { bufferToBase64 } from "./generateReceipt";

/** iPos: 0 = ready, 4 = busy */
const IPOS_STATUS_READY = 0;

type PosAidlPrinterModule = {
  connect: () => Promise<string>;
  disconnect: () => Promise<boolean>;
  isConnected: () => Promise<boolean>;
  getBackend: () => Promise<string>;
  getPrinterStatus: () => Promise<number>;
  writeRaw: (base64Data: string) => Promise<boolean>;
};

let connectedBackend: string | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getModule(): PosAidlPrinterModule | null {
  if (Platform.OS !== "android") return null;
  return NativeModules.PosAidlPrinter ?? null;
}

function prependUtf8Init(buffer: Uint8Array): Uint8Array {
  const prefix = new Uint8Array([0x1b, 0x40, 0x1c, 0x26]);
  const merged = new Uint8Array(prefix.length + buffer.length);
  merged.set(prefix);
  merged.set(buffer, prefix.length);
  return merged;
}

export function isPosAidlPrinterModuleAvailable(): boolean {
  return getModule() != null;
}

export function getPosAidlBackend(): string | null {
  return connectedBackend;
}

export async function isPosAidlPrinterReady(): Promise<boolean> {
  const module = getModule();
  if (!module) return false;
  try {
    return await module.isConnected();
  } catch {
    return false;
  }
}

export async function connectPosAidlPrinter(): Promise<boolean> {
  const module = getModule();
  if (!module) return false;

  try {
    await module.disconnect().catch(() => undefined);
    const backend = await module.connect();
    connectedBackend = backend || "ipos";
    await delay(300);
    return await module.isConnected();
  } catch {
    connectedBackend = null;
    return false;
  }
}

export async function disconnectPosAidlPrinter(): Promise<void> {
  const module = getModule();
  if (!module) return;
  try {
    await module.disconnect();
  } catch {
    // ignore
  }
  connectedBackend = null;
}

export async function checkPosAidlPrinterStatus(): Promise<{
  ready: boolean;
  message: string;
}> {
  const module = getModule();
  if (!module) {
    return {
      ready: false,
      message: "iPos printer module not available — rebuild the app",
    };
  }

  try {
    const connected = await module.isConnected();
    if (!connected) {
      return { ready: false, message: "iPos printer service not connected" };
    }

    const status = await module.getPrinterStatus();
    if (status === IPOS_STATUS_READY) {
      const backend = (await module.getBackend()) || "ipos";
      return { ready: true, message: `Printer ready (${backend})` };
    }

    const messages: Record<number, string> = {
      1: "Out of paper",
      2: "Print head overheated",
      3: "Motor overheated — reinitialize printer",
      4: "Printer is busy",
      5: "Printer error",
    };
    return {
      ready: status === 4,
      message: messages[status] ?? `Printer status code: ${status}`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to read printer status";
    return { ready: false, message };
  }
}

export async function printPosAidlRaw(buffer: Uint8Array): Promise<void> {
  const module = getModule();
  if (!module) {
    throw new Error("iPos printer module not available");
  }

  const connected = await module.isConnected();
  if (!connected) {
    throw new Error("iPos printer service not connected");
  }

  const payload = prependUtf8Init(buffer);
  await module.writeRaw(bufferToBase64(payload));
}
