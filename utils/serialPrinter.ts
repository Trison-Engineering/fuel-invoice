import { NativeModules, Platform } from "react-native";
import { bufferToBase64 } from "./generateReceipt";

const SERIAL_ID = "serial-pos-printer";
const SERIAL_NAME = "Serial POS Printer (ttyS)";
const SERIAL_PATHS = ["/dev/ttyS1", "/dev/ttyS2"] as const;

type PosSerialPrinterModule = {
  connect: (path: string) => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  isConnected: () => Promise<boolean>;
  writeRaw: (base64Data: string) => Promise<boolean>;
};

let connectedPath: string | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSerialModule(): PosSerialPrinterModule | null {
  if (Platform.OS !== "android") return null;
  return NativeModules.PosSerialPrinter ?? null;
}

function prependUtf8Init(buffer: Uint8Array): Uint8Array {
  const prefix = new Uint8Array([0x1b, 0x40, 0x1c, 0x26]);
  const merged = new Uint8Array(prefix.length + buffer.length);
  merged.set(prefix);
  merged.set(buffer, prefix.length);
  return merged;
}

export function isSerialPrinterModuleAvailable(): boolean {
  return getSerialModule() != null;
}

export function getSerialPrinterId(): string {
  return SERIAL_ID;
}

export function getSerialPrinterName(path?: string): string {
  return path ? `${SERIAL_NAME} ${path}` : SERIAL_NAME;
}

export function getConnectedSerialPath(): string | null {
  return connectedPath;
}

export async function isSerialPrinterReady(): Promise<boolean> {
  const module = getSerialModule();
  if (!module) return false;
  try {
    return await module.isConnected();
  } catch {
    return false;
  }
}

export async function connectSerialPrinter(preferredPath?: string): Promise<boolean> {
  const module = getSerialModule();
  if (!module) return false;

  const paths = preferredPath ? [preferredPath, ...SERIAL_PATHS] : [...SERIAL_PATHS];
  const uniquePaths = [...new Set(paths)];

  for (const path of uniquePaths) {
    try {
      await module.disconnect().catch(() => undefined);
      const connected = await module.connect(path);
      if (connected) {
        connectedPath = path;
        await delay(200);
        return true;
      }
    } catch {
      // try next path
    }
  }

  connectedPath = null;
  return false;
}

export async function disconnectSerialPrinter(): Promise<void> {
  const module = getSerialModule();
  if (!module) return;
  try {
    await module.disconnect();
  } catch {
    // ignore
  }
  connectedPath = null;
}

export async function checkSerialPrinterStatus(): Promise<{
  ready: boolean;
  message: string;
}> {
  const module = getSerialModule();
  if (!module) {
    return { ready: false, message: "Serial printer module not available (rebuild required)" };
  }

  try {
    const connected = await module.isConnected();
    if (!connected) {
      return { ready: false, message: "Serial printer not connected" };
    }
    return {
      ready: true,
      message: connectedPath ? `Serial ready on ${connectedPath}` : "Serial ready",
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to read serial printer status";
    return { ready: false, message };
  }
}

export async function printSerialRaw(buffer: Uint8Array): Promise<void> {
  const module = getSerialModule();
  if (!module) {
    throw new Error("Serial printer module not available");
  }

  const connected = await module.isConnected();
  if (!connected) {
    throw new Error("Serial printer not connected");
  }

  const payload = prependUtf8Init(buffer);
  await module.writeRaw(bufferToBase64(payload));
}
