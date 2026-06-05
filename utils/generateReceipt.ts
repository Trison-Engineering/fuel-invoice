import { centerText, formatDate, formatTime } from "./formatters";
import {
  buildFuelReceiptTextLines,
  formatRateRs,
  formatRow,
  formatTotalRs,
  formatVolumeLtr,
  getPaymentLabel,
  normalizePrintAddress,
  RECEIPT_DIVIDER,
} from "./receiptFormat";

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
  return buildFuelReceiptTextLines(data);
}

export function generateEscPosBuffer(data: ReceiptData): Uint8Array {
  const parts: Uint8Array[] = [cmdInit()];
  const payment = getPaymentLabel(data.paymentMethod);

  parts.push(
    cmdAlign(1),
    cmdBold(true),
    cmdLine(centerText(data.stationName.toUpperCase())),
    cmdBold(false)
  );

  const address = normalizePrintAddress(data.stationAddress);
  if (address) {
    parts.push(cmdLine(centerText(address)));
  }

  parts.push(cmdBold(true), cmdLine(centerText("FUEL RECEIPT")), cmdBold(false));
  parts.push(cmdLine(RECEIPT_DIVIDER));

  parts.push(cmdAlign(0));
  parts.push(cmdLine(formatRow("RECEIPT NO:", data.invoiceNumber)));
  parts.push(cmdLine(formatRow("DATE:", formatDate(data.date))));
  parts.push(cmdLine(formatRow("TIME:", formatTime(data.time))));
  parts.push(cmdLine(formatRow("PAYMENT:", payment)));
  parts.push(cmdLine(RECEIPT_DIVIDER));

  parts.push(cmdLine(formatRow("PRODUCT:", data.productType.toUpperCase())));
  parts.push(cmdLine(formatRow("VOLUME:", formatVolumeLtr(data.volume))));
  parts.push(cmdLine(formatRow("RATE/LTR:", formatRateRs(data.fuelRate))));
  parts.push(cmdLine(RECEIPT_DIVIDER));

  parts.push(
    cmdBold(true),
    cmdLine(formatRow("TOTAL AMOUNT:", formatTotalRs(data.totalAmount))),
    cmdBold(false)
  );
  parts.push(cmdLine(RECEIPT_DIVIDER));

  if (data.vehicleNumber.trim()) {
    parts.push(cmdLine(formatRow("VEHICLE NO:", data.vehicleNumber)));
    parts.push(cmdLine(RECEIPT_DIVIDER));
  }

  parts.push(
    cmdAlign(1),
    cmdLine(centerText("POWERED BY TRISON")),
    cmdLine(centerText("THANKS FOR FUELLING WITH US")),
    cmdLine(centerText("VISIT AGAIN"))
  );

  parts.push(cmdFeed(3), cmdCut());

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
