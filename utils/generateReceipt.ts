import {
  centerText,
  formatCurrencyValue,
  formatDate,
  formatTime,
  padLabelValue,
  wrapText,
} from "./formatters";
import { receiptWidth } from "../constants/theme";

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
  nozzleNo: string;
  customerName: string;
  logoDataUrl?: string | null;
  includeLogoInPrint?: boolean;
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const SEPARATOR = "━".repeat(receiptWidth);

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

function cmdInit(): Uint8Array {
  return new Uint8Array([ESC, 0x40]);
}

function cmdAlign(align: 0 | 1 | 2): Uint8Array {
  return new Uint8Array([ESC, 0x61, align]);
}

function cmdBold(on: boolean): Uint8Array {
  return new Uint8Array([ESC, 0x45, on ? 1 : 0]);
}

function cmdDoubleHeight(on: boolean): Uint8Array {
  return new Uint8Array([GS, 0x21, on ? 0x10 : 0x00]);
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

export function buildReceiptLines(data: ReceiptData): string[] {
  const lines: string[] = [];

  lines.push(centerText(data.stationName.toUpperCase()));
  for (const line of wrapText(data.stationAddress)) {
    lines.push(centerText(line));
  }
  lines.push(SEPARATOR);
  lines.push(centerText("FUEL RECEIPT"));
  lines.push(SEPARATOR);
  lines.push(padLabelValue("RCPT NO:", data.invoiceNumber));
  lines.push(padLabelValue("DATE:", formatDate(data.date)));
  lines.push(padLabelValue("TIME:", formatTime(data.time)));
  if (data.paymentMethod !== "None") {
    lines.push(padLabelValue("PAYMENT:", data.paymentMethod.toUpperCase()));
  }
  if (data.nozzleNo.trim()) {
    lines.push(padLabelValue("NOZZLE:", data.nozzleNo));
  }
  lines.push(SEPARATOR);
  lines.push(padLabelValue("PRODUCT:", data.productType.toUpperCase()));
  lines.push(padLabelValue("VOLUME(LTR):", formatCurrencyValue(data.volume)));
  lines.push(padLabelValue("RATE/LTR(Rs.):", formatCurrencyValue(data.fuelRate)));
  lines.push(SEPARATOR);
  lines.push(padLabelValue("TOTAL(Rs.):", formatCurrencyValue(data.totalAmount)));
  lines.push(SEPARATOR);
  lines.push(padLabelValue("VEHICLE:", data.vehicleNumber));
  if (data.customerName.trim()) {
    lines.push(padLabelValue("CUSTOMER:", data.customerName));
  }
  lines.push(SEPARATOR);
  lines.push(centerText("POWERED BY TRISON"));
  lines.push(centerText("THANKS FOR FUELLING WITH US"));
  lines.push(centerText("VISIT AGAIN"));

  return lines;
}

export function generateEscPosBuffer(data: ReceiptData): Uint8Array {
  const parts: Uint8Array[] = [cmdInit()];

  parts.push(
    cmdAlign(1),
    cmdBold(true),
    cmdLine(centerText(data.stationName.toUpperCase())),
    cmdBold(false)
  );

  for (const line of wrapText(data.stationAddress)) {
    parts.push(cmdLine(centerText(line)));
  }

  parts.push(cmdLine(SEPARATOR));
  parts.push(cmdBold(true), cmdLine(centerText("FUEL RECEIPT")), cmdBold(false));
  parts.push(cmdLine(SEPARATOR));

  parts.push(cmdAlign(0));
  parts.push(cmdLine(padLabelValue("RCPT NO:", data.invoiceNumber)));
  parts.push(cmdLine(padLabelValue("DATE:", formatDate(data.date))));
  parts.push(cmdLine(padLabelValue("TIME:", formatTime(data.time))));

  if (data.paymentMethod !== "None") {
    parts.push(cmdLine(padLabelValue("PAYMENT:", data.paymentMethod.toUpperCase())));
  }
  if (data.nozzleNo.trim()) {
    parts.push(cmdLine(padLabelValue("NOZZLE:", data.nozzleNo)));
  }

  parts.push(cmdLine(SEPARATOR));
  parts.push(cmdLine(padLabelValue("PRODUCT:", data.productType.toUpperCase())));
  parts.push(cmdLine(padLabelValue("VOLUME(LTR):", formatCurrencyValue(data.volume))));
  parts.push(cmdLine(padLabelValue("RATE/LTR(Rs.):", formatCurrencyValue(data.fuelRate))));
  parts.push(cmdLine(SEPARATOR));

  parts.push(
    cmdBold(true),
    cmdDoubleHeight(true),
    cmdLine(padLabelValue("TOTAL(Rs.):", formatCurrencyValue(data.totalAmount))),
    cmdDoubleHeight(false),
    cmdBold(false)
  );

  parts.push(cmdLine(SEPARATOR));
  parts.push(cmdLine(padLabelValue("VEHICLE:", data.vehicleNumber)));
  if (data.customerName.trim()) {
    parts.push(cmdLine(padLabelValue("CUSTOMER:", data.customerName)));
  }
  parts.push(cmdLine(SEPARATOR));

  parts.push(
    cmdAlign(1),
    cmdLine(centerText("POWERED BY TRISON")),
    cmdLine(centerText("THANKS FOR FUELLING WITH US")),
    cmdLine(centerText("VISIT AGAIN"))
  );

  parts.push(cmdFeed(4), cmdCut());

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
