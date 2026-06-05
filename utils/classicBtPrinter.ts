import { NativeModules, Platform } from "react-native";
import { bufferToBase64 } from "./generateReceipt";
import { INNER_PRINTER } from "../constants/innerPrinter";
import { logPrinterAttempt } from "./printerLog";

const CLASSIC_BT_ID = "classic-bt-inner-printer";

export interface BondedBluetoothDevice {
  name: string;
  address: string;
}

type PosClassicBtPrinterModule = {
  connect: (macAddress: string) => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  isConnected: () => Promise<boolean>;
  isBluetoothEnabled: () => Promise<boolean>;
  isInnerPrinterPaired: (macAddress: string, deviceName: string) => Promise<boolean>;
  openBluetoothSettings: () => Promise<boolean>;
  getConnectedAddress: () => Promise<string>;
  listBondedPrinters: () => Promise<string>;
  writeRaw: (base64Data: string) => Promise<boolean>;
};

let lastConnectError: string | null = null;

function getClassicBtModule(): PosClassicBtPrinterModule | null {
  if (Platform.OS !== "android") return null;
  return NativeModules.PosClassicBtPrinter ?? null;
}

function prependUtf8Init(buffer: Uint8Array): Uint8Array {
  const prefix = new Uint8Array([0x1b, 0x40, 0x1c, 0x26]);
  const merged = new Uint8Array(prefix.length + buffer.length);
  merged.set(prefix);
  merged.set(buffer, prefix.length);
  return merged;
}

function parseBondedList(raw: string): BondedBluetoothDevice[] {
  if (!raw) return [];
  return raw.split("|").filter(Boolean).map((entry) => {
    const colon = entry.lastIndexOf(":");
    if (colon <= 0) return { name: entry, address: "" };
    return {
      name: entry.slice(0, colon),
      address: entry.slice(colon + 1),
    };
  });
}

export function isClassicBtPrinterModuleAvailable(): boolean {
  return getClassicBtModule() != null;
}

export function getClassicBtPrinterId(): string {
  return CLASSIC_BT_ID;
}

export function getClassicBtLastConnectError(): string | null {
  return lastConnectError;
}

export async function isBluetoothEnabled(): Promise<boolean> {
  const module = getClassicBtModule();
  if (!module) return false;
  try {
    return await module.isBluetoothEnabled();
  } catch {
    return false;
  }
}

export async function isInnerPrinterPaired(): Promise<boolean> {
  const module = getClassicBtModule();
  if (!module) return false;
  try {
    const paired = await module.isInnerPrinterPaired(
      INNER_PRINTER.macAddress,
      INNER_PRINTER.name
    );
    logPrinterAttempt(`InnerPrinter paired check: ${paired}`);
    return paired;
  } catch (e) {
    logPrinterAttempt("InnerPrinter paired check failed", e);
    return false;
  }
}

export async function getBondedDevices(): Promise<BondedBluetoothDevice[]> {
  const module = getClassicBtModule();
  if (!module) return [];
  try {
    const raw = await module.listBondedPrinters();
    const devices = parseBondedList(raw);
    logPrinterAttempt("Bonded devices", devices);
    return devices;
  } catch {
    return [];
  }
}

export async function isClassicBtPrinterReady(): Promise<boolean> {
  const module = getClassicBtModule();
  if (!module) return false;
  try {
    return await module.isConnected();
  } catch {
    return false;
  }
}

export async function connectClassicBtPrinter(
  macAddress: string = INNER_PRINTER.macAddress
): Promise<boolean> {
  const module = getClassicBtModule();
  if (!module) {
    lastConnectError = "Classic Bluetooth module not available — rebuild the app";
    logPrinterAttempt(lastConnectError);
    return false;
  }

  try {
    logPrinterAttempt(`RFCOMM connect → ${macAddress}`);
    await module.disconnect().catch(() => undefined);
    await module.connect(macAddress);
    lastConnectError = null;
    logPrinterAttempt("RFCOMM connect succeeded");
    return true;
  } catch (e) {
    lastConnectError = e instanceof Error ? e.message : "Classic Bluetooth connect failed";
    logPrinterAttempt("RFCOMM connect failed", lastConnectError);
    return false;
  }
}

export async function disconnectClassicBtPrinter(): Promise<void> {
  const module = getClassicBtModule();
  if (!module) return;
  try {
    await module.disconnect();
  } catch {
    // ignore
  }
}

export async function openBluetoothSettingsNative(): Promise<boolean> {
  const module = getClassicBtModule();
  if (!module?.openBluetoothSettings) return false;
  try {
    await module.openBluetoothSettings();
    return true;
  } catch {
    return false;
  }
}

export async function checkClassicBtPrinterStatus(): Promise<{
  ready: boolean;
  message: string;
}> {
  const module = getClassicBtModule();
  if (!module) {
    return { ready: false, message: "Classic Bluetooth module not available (rebuild required)" };
  }

  try {
    const connected = await module.isConnected();
    if (!connected) {
      return { ready: false, message: lastConnectError ?? "InnerPrinter not connected via SPP" };
    }
    const address = await module.getConnectedAddress();
    return {
      ready: true,
      message: address ? `InnerPrinter connected (${address})` : "InnerPrinter connected",
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to read Classic Bluetooth status";
    return { ready: false, message };
  }
}

export async function printClassicBtRaw(buffer: Uint8Array): Promise<void> {
  const module = getClassicBtModule();
  if (!module) {
    throw new Error("Classic Bluetooth module not available");
  }

  const connected = await module.isConnected();
  if (!connected) {
    throw new Error("InnerPrinter not connected");
  }

  const payload = prependUtf8Init(buffer);
  await module.writeRaw(bufferToBase64(payload));
}
