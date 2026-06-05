import { NativeModules, Platform } from "react-native";
import { bufferToBase64 } from "./generateReceipt";
import { logPrinterAttempt } from "./printerLog";

const SERIAL_ID = "serial-pos-printer";
const SERIAL_NAME = "Serial POS Printer";

export const SERIAL_PATHS = [
  "/dev/ttyS0",
  "/dev/ttyS1",
  "/dev/ttyS2",
  "/dev/ttyS3",
  "/dev/ttyUSB0",
  "/dev/ttyACM0",
  "/dev/ttyHS0",
  "/dev/ttyHS1",
  "/dev/ttyMT0",
  "/dev/ttyMT1",
] as const;

export const SERIAL_BAUD_RATES = [9600, 19200, 115200] as const;

type PosSerialPrinterModule = {
  connect: (path: string, baudRate: number) => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  isConnected: () => Promise<boolean>;
  getConnectedInfo: () => Promise<string>;
  writeRaw: (base64Data: string) => Promise<boolean>;
};

let connectedPath: string | null = null;
let connectedBaud: number | null = null;
let lastSerialError: string | null = null;

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

export function getSerialLastConnectError(): string | null {
  return lastSerialError;
}

export function getSerialPrinterName(path?: string, baud?: number): string {
  if (path && baud) return `${SERIAL_NAME} ${path} @ ${baud}`;
  if (path) return `${SERIAL_NAME} ${path}`;
  return SERIAL_NAME;
}

export function getConnectedSerialPath(): string | null {
  return connectedPath;
}

export function getConnectedSerialBaud(): number | null {
  return connectedBaud;
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
  if (!module) {
    lastSerialError = "Serial module not available";
    return false;
  }

  const paths = preferredPath
    ? [preferredPath, ...SERIAL_PATHS.filter((p) => p !== preferredPath)]
    : [...SERIAL_PATHS];

  await module.disconnect().catch(() => undefined);

  for (const path of paths) {
    for (const baud of SERIAL_BAUD_RATES) {
      try {
        logPrinterAttempt(`Serial try ${path} @ ${baud} baud`);
        await module.connect(path, baud);
        connectedPath = path;
        connectedBaud = baud;
        lastSerialError = null;
        await delay(200);
        logPrinterAttempt(`Serial connected ${path} @ ${baud}`);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Serial connect failed";
        lastSerialError = `${path} @ ${baud}: ${msg}`;
        logPrinterAttempt("Serial attempt failed", lastSerialError);
      }
    }
  }

  connectedPath = null;
  connectedBaud = null;
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
  connectedBaud = null;
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
      return {
        ready: false,
        message: lastSerialError ?? "Serial printer not connected",
      };
    }
    return {
      ready: true,
      message:
        connectedPath && connectedBaud
          ? `Serial ready on ${connectedPath} @ ${connectedBaud}`
          : "Serial ready",
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
