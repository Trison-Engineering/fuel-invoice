import {
  buildReceiptPrintPlan,
  mapFuelReceiptToPrintView,
  type ReceiptPrintLine,
} from "./receiptFormat";
import {
  ESC_POS_LINE_SPACING,
  RECEIPT_FONT,
} from "../constants/printerPaper";

export interface ReceiptData {
  stationName: string;
  stationAddress: string;
  invoiceNumber: string;
  date: string;
  time: string;
  paymentMethod: string;
  productType: string;
  fuelRate: string;
  volume: string;
  totalAmount: number;
  vehicleNumber: string;
  customerName: string;
  logoDataUrl?: string | null;
  includeLogoInPrint?: boolean;
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

function textEncoder(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes.push(code <= 255 ? code : 0x3f);
  }
  return new Uint8Array(bytes);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function cmdInitReceipt(): Uint8Array {
  return new Uint8Array([ESC, 0x40, ESC, 0x33, ESC_POS_LINE_SPACING]);
}

function cmdAlign(align: 0 | 1 | 2): Uint8Array {
  return new Uint8Array([ESC, 0x61, align]);
}

function cmdBold(on: boolean): Uint8Array {
  return new Uint8Array([ESC, 0x45, on ? 1 : 0]);
}

function resolveFontSizePx(line: ReceiptPrintLine): number {
  if (line.fontSizePx != null) return line.fontSizePx;
  switch (line.font) {
    case "store":
      return RECEIPT_FONT.storeName;
    case "heading":
      return RECEIPT_FONT.heading;
    case "total":
      return RECEIPT_FONT.total;
    default:
      return RECEIPT_FONT.body;
  }
}

/** Map receipt font px to ESC/POS GS ! size for 58 mm paper. */
function cmdCharSizeFromPx(px: number): Uint8Array {
  if (px >= 40) return new Uint8Array([GS, 0x21, 0x11]);
  if (px >= 32) return new Uint8Array([GS, 0x21, 0x10]);
  if (px >= 28) return new Uint8Array([GS, 0x21, 0x01]);
  return new Uint8Array([GS, 0x21, 0x00]);
}

function cmdLine(text: string): Uint8Array {
  return concatBytes(textEncoder(text), new Uint8Array([LF]));
}

function cmdFeed(lines: number): Uint8Array {
  return new Uint8Array([ESC, 0x64, lines]);
}

function cmdCut(): Uint8Array {
  return new Uint8Array([GS, 0x56, 0x00]);
}

function appendPrintLine(parts: Uint8Array[], line: ReceiptPrintLine): void {
  parts.push(cmdAlign(line.align));
  parts.push(cmdCharSizeFromPx(resolveFontSizePx(line)));
  if (line.bold) parts.push(cmdBold(true));
  parts.push(cmdLine(line.text));
  if (line.bold) parts.push(cmdBold(false));
  parts.push(cmdCharSizeFromPx(RECEIPT_FONT.body));
}

export function buildReceiptLines(data: ReceiptData): string[] {
  const view = mapFuelReceiptToPrintView(data);
  return buildReceiptPrintPlan(view).map((line) => line.text);
}

export function generateEscPosBuffer(data: ReceiptData, options?: { sunmi?: boolean }): Uint8Array {
  const sunmi = options?.sunmi ?? false;
  const view = mapFuelReceiptToPrintView(data);
  const plan = buildReceiptPrintPlan(view);
  const parts: Uint8Array[] = [cmdInitReceipt()];

  for (const line of plan) {
    appendPrintLine(parts, line);
  }

  parts.push(cmdFeed(sunmi ? 6 : 4));
  if (!sunmi) {
    parts.push(cmdCut());
  }

  return concatBytes(...parts);
}

export function bufferToBase64(buffer: Uint8Array): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let i = 0; i < buffer.length; i += 3) {
    const a = buffer[i];
    const b = buffer[i + 1] ?? 0;
    const c = buffer[i + 2] ?? 0;
    result += chars[a >> 2];
    result += chars[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < buffer.length ? chars[((b & 15) << 2) | (c >> 6)] : "=";
    result += i + 2 < buffer.length ? chars[c & 63] : "=";
  }
  return result;
}
