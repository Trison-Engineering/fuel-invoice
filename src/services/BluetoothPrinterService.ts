import AsyncStorage from "@react-native-async-storage/async-storage";
import { Buffer } from "buffer";
import { NativeModules } from "react-native";
import {
  BluetoothEscposPrinter,
  BluetoothManager,
} from "@vardrz/react-native-bluetooth-escpos-printer";
import { getItem, StorageKeys } from "../../utils/storage";
import type { StationProfile } from "../../stores/stationStore";
import { resolveLogoBase64 } from "../utils/printLogoUtil";
import { RawLogoKeys } from "../utils/logoStorage";

const { SunmiPrinterModule } = NativeModules;

export const INNER_PRINTER_MAC = "00:11:22:33:44:55";
export const INNER_PRINTER_NAME = "InnerPrinter";

const LINE = 32;
const DIV = "-".repeat(LINE);

const escpos = BluetoothEscposPrinter as typeof BluetoothEscposPrinter & {
  sendRAWData(base64: string): Promise<void>;
  printDualPic(
    base64Left: string,
    base64Right: string,
    options?: { width?: number; feed?: number }
  ): Promise<void>;
};

let connected = false;

const center = (text: string): string => {
  if (text.length >= LINE) return text;
  const sp = Math.floor((LINE - text.length) / 2);
  return " ".repeat(sp) + text;
};

const row = (label: string, value: string): string => {
  const total = label.length + value.length;
  if (total >= LINE) {
    const max = LINE - value.length - 1;
    return label.substring(0, Math.max(1, max)) + " " + value;
  }
  return label + " ".repeat(LINE - total) + value;
};

/** Build one ESC/POS payload: ESC @ + ASCII lines + LF + ESC d feed. No GS!/ESC t/ESC M prefix. */
const buildRawReceipt = (lines: string[], feedLines = 5): Uint8Array => {
  const parts: number[] = [];

  parts.push(0x1b, 0x40);

  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      parts.push(line.charCodeAt(i) & 0xff);
    }
    parts.push(0x0a);
  }

  parts.push(0x1b, 0x64, feedLines & 0xff);

  return new Uint8Array(parts);
};

/** Word-wrap at LINE width — never splits a word mid-character. */
const wrapWordLines = (text: string): string[] => {
  const wrapped: string[] = [];
  const words = text.trim().split(/\s+/).filter(Boolean);
  let currentLine = "";

  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    if (test.length <= LINE) {
      currentLine = test;
    } else {
      if (currentLine) wrapped.push(center(currentLine));
      currentLine = word;
    }
  }

  if (currentLine) wrapped.push(center(currentLine));
  return wrapped;
};

const wrapAddressLines = (address: string): string[] => wrapWordLines(address);

const printLogo = async (): Promise<void> => {
  try {
    const includeLogo = await getItem<boolean>(StorageKeys.INCLUDE_LOGO_IN_PRINT);
    if (!includeLogo) return;

    let logo1 = await AsyncStorage.getItem(RawLogoKeys.LOGO_1);

    if (!logo1) {
      const profile = await getItem<StationProfile>(StorageKeys.STATION_PROFILE);
      if (profile?.logoDataUrl) {
        logo1 = (await resolveLogoBase64(profile.logoDataUrl).catch(() => null)) ?? null;
      }
    }

    if (!logo1) return;

    try {
      await SunmiPrinterModule.printLogo(logo1);
      console.log("[BT] logo printed via native AIDL printBitmap");
    } catch (e) {
      console.warn("[BT] native logo print failed:", e);
    }
  } catch (e) {
    console.warn("[BT] Logo print failed:", e);
  }
};

const buildReceiptLines = (data: BluetoothReceiptData, isDuplicate = false): string[] => {
  const lines: string[] = [
    center("Welcome to"),
    ...wrapWordLines(data.storeName.toUpperCase()),
    ...wrapAddressLines(data.address),
    center("FUEL RECEIPT"),
  ];

  if (isDuplicate) {
    lines.push(center("** DUPLICATE COPY **"));
  }

  lines.push(
    DIV,
    row("DATE:", data.dateTime),
    DIV,
    row("PRODUCT:", data.product),
    row("VOLUME:", `${data.volume} LTR`),
    row("RATE/LTR:", `Rs. ${data.rate}`),
    DIV,
    row("TOTAL AMOUNT:", `Rs. ${data.total}`),
    DIV
  );

  if (data.vehicleNo?.trim()) {
    lines.push(row("VEHICLE NO:", data.vehicleNo), DIV);
  }

  lines.push(center("POWERED BY TRISON"));

  const phone = data.stationPhone?.trim();
  if (phone) {
    lines.push(
      ...wrapWordLines(`Thank you for visiting us! Contact Us : ${phone}`)
    );
  } else {
    lines.push(center("Thank you for visiting us!"));
  }

  return lines;
};

/** Direct SPP write via patched sendRAWData — bypasses printText 9-byte prefix. */
const sendRawBytes = async (bytes: Uint8Array): Promise<void> => {
  if (!escpos.sendRAWData) {
    throw new Error(
      "BluetoothEscposPrinter.sendRAWData is missing. Rebuild with expo prebuild so withBluetoothRawPrinter runs."
    );
  }

  const base64 = Buffer.from(bytes).toString("base64");
  console.log("[BT] sendRAWData bytes:", bytes.length, "first16:", Array.from(bytes.slice(0, 16)));

  try {
    const result = await escpos.sendRAWData(base64);
    console.log("[BT] sendRAWData result:", result ?? "ok");
  } catch (e) {
    console.error("[BT] sendRAWData failed:", e);
    throw e;
  }
};

async function ensureBluetoothEnabled(): Promise<void> {
  const enabled = await BluetoothManager.isBluetoothEnabled();
  if (!enabled) {
    await BluetoothManager.enableBluetooth();
  }
}

export function isInnerPrinterConnected(): boolean {
  return connected;
}

export const connectInnerPrinter = async (): Promise<boolean> => {
  try {
    await ensureBluetoothEnabled();
    await BluetoothManager.connect(INNER_PRINTER_MAC);
    connected = true;
    console.log("[BluetoothPrinter] InnerPrinter connected");
    return true;
  } catch (e) {
    connected = false;
    console.error("[BluetoothPrinter] InnerPrinter connect failed:", e);
    return false;
  }
};

export interface BluetoothReceiptData {
  storeName: string;
  address: string;
  dateTime: string;
  product: string;
  volume: string;
  rate: string;
  total: string;
  vehicleNo?: string;
  stationPhone?: string;
}

export const printReceipt = async (
  data: BluetoothReceiptData,
  isDuplicate = false
): Promise<void> => {
  // Print the entire receipt (logo + text) through the native Sunmi service.
  // Do NOT open a competing @vardrz Bluetooth SPP session — it holds the
  // physical printer and blocks native bitmap output.
  const includeLogo = await getItem<boolean>(StorageKeys.INCLUDE_LOGO_IN_PRINT);
  let logo1: string | null = null;
  if (includeLogo) {
    logo1 = await AsyncStorage.getItem(RawLogoKeys.LOGO_1);
    if (!logo1) {
      const profile = await getItem<StationProfile>(StorageKeys.STATION_PROFILE);
      if (profile?.logoDataUrl) {
        logo1 = (await resolveLogoBase64(profile.logoDataUrl).catch(() => null)) ?? null;
      }
    }
  }

  await SunmiPrinterModule.printFullReceipt(
    logo1 ?? "",
    data.storeName,
    data.address,
    data.dateTime,
    data.product,
    data.volume,
    data.rate,
    data.total,
    data.vehicleNo ?? "",
    data.stationPhone ?? "",
    isDuplicate
  );
  console.log("[Printer] full receipt printed via native Sunmi service");
};

export const printDiagnostic = async (): Promise<void> => {
  const ok = await connectInnerPrinter();
  if (!ok) return;

  const lines = [
    "--------------------------------",
    "     PRINTER CONNECTED OK",
    "       Sunmi V2s Ready",
    "--------------------------------",
  ];

  const bytes = buildRawReceipt(lines, 5);
  await sendRawBytes(bytes);
  console.log("[BT] Diagnostic sent");
};

export const printTestLine = async (): Promise<void> => {
  const ok = await connectInnerPrinter();
  if (!ok) {
    throw new Error("Could not connect to InnerPrinter");
  }

  const bytes = buildRawReceipt([center("TEST PRINT OK")], 3);
  await sendRawBytes(bytes);
};
