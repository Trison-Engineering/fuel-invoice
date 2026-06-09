import AsyncStorage from "@react-native-async-storage/async-storage";
import { Buffer } from "buffer";
import {
  BluetoothEscposPrinter,
  BluetoothManager,
} from "@vardrz/react-native-bluetooth-escpos-printer";
import { getItem, StorageKeys } from "../../utils/storage";
import type { StationProfile } from "../../stores/stationStore";
import {
  LOGO_PRINT_WIDTH_DUAL,
  LOGO_PRINT_WIDTH_SINGLE,
  preprocessLogoForPrinting,
  resolveLogoBase64,
} from "../utils/printLogoUtil";
import { RawLogoKeys } from "../utils/logoStorage";

export const INNER_PRINTER_MAC = "00:11:22:33:44:55";
export const INNER_PRINTER_NAME = "InnerPrinter";

const LINE = 32;
const DIV = "-".repeat(LINE);
const LOGO_PRINT_FEED = 1;

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

/** Raw LF after logo — uses sendRAWData to avoid printText prefix bytes. */
const sendLogoSeparator = async (): Promise<void> => {
  if (!escpos.sendRAWData) return;
  await escpos.sendRAWData(Buffer.from([0x0a]).toString("base64"));
};

const printLogo = async (): Promise<void> => {
  try {
    const includeLogo = await getItem<boolean>(StorageKeys.INCLUDE_LOGO_IN_PRINT);
    if (!includeLogo) return;

    let logo1 = await AsyncStorage.getItem(RawLogoKeys.LOGO_1);
    const useTwoLogos = (await AsyncStorage.getItem(RawLogoKeys.USE_TWO_LOGOS)) === "true";
    let logo2 =
      useTwoLogos ? await AsyncStorage.getItem(RawLogoKeys.LOGO_2) : null;

    if (!logo1) {
      const profile = await getItem<StationProfile>(StorageKeys.STATION_PROFILE);
      if (profile?.logoDataUrl) {
        logo1 = (await resolveLogoBase64(profile.logoDataUrl).catch(() => null)) ?? null;
      }
      if (useTwoLogos && profile?.logo2DataUrl && !logo2) {
        logo2 = (await resolveLogoBase64(profile.logo2DataUrl).catch(() => null)) ?? null;
      }
    }

    if (!logo1) return;

    const logo1Processed = await preprocessLogoForPrinting(logo1);
    console.log(
      "[BT] Printing logo at 576px preprocessed, base64 length:",
      logo1Processed.length
    );

    if (useTwoLogos && logo2) {
      const logo2Processed = await preprocessLogoForPrinting(logo2);

      if (!escpos.printDualPic) {
        throw new Error(
          "printDualPic is missing. Rebuild with expo prebuild so withBluetoothRawPrinter runs."
        );
      }

      await escpos.printDualPic(logo1Processed, logo2Processed, {
        width: LOGO_PRINT_WIDTH_DUAL,
        feed: LOGO_PRINT_FEED,
      });
    } else {
      await BluetoothEscposPrinter.printPic(logo1Processed, {
        width: LOGO_PRINT_WIDTH_SINGLE,
        left: 0,
        center: false,
        autoCut: false,
        feed: LOGO_PRINT_FEED,
      });
    }

    await sendLogoSeparator();
  } catch (e) {
    console.warn("[BT] Logo print failed:", e);
  }
};

const buildReceiptLines = (data: BluetoothReceiptData): string[] => {
  const lines: string[] = [
    ...wrapWordLines(data.storeName.toUpperCase()),
    ...wrapAddressLines(data.address),
    center("FUEL RECEIPT"),
    DIV,
    row("DATE:", data.dateTime),
    DIV,
    row("PRODUCT:", data.product),
    row("VOLUME:", `${data.volume} LTR`),
    row("RATE/LTR:", `Rs. ${data.rate}`),
    DIV,
    row("TOTAL AMOUNT:", `Rs. ${data.total}`),
    DIV,
  ];

  if (data.vehicleNo?.trim()) {
    lines.push(row("VEHICLE NO:", data.vehicleNo), DIV);
  }

  lines.push(center("POWERED BY TRISON"));
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
}

export const printReceipt = async (data: BluetoothReceiptData): Promise<void> => {
  const ok = await connectInnerPrinter();
  if (!ok) {
    throw new Error("Could not connect to InnerPrinter");
  }

  await printLogo();

  const lines = buildReceiptLines(data);
  const bytes = buildRawReceipt(lines, 5);
  await sendRawBytes(bytes);
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
