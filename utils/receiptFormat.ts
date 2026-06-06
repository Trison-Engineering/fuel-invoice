import {
  LOGO_BITMAP_WIDTH,
  LOGO_MAX_SIZE,
  RECEIPT_FONT,
  RECEIPT_LINE_WIDTH,
} from "../constants/printerPaper";
import { formatCurrency, formatVolume, safeStr } from "../src/utils/printerUtils";
import { formatDate, formatTime } from "./formatters";
import type { ReceiptData } from "./generateReceipt";

/** Chars per line on 2" Sunmi paper — used for preview and print. */
export const LINE_WIDTH = RECEIPT_LINE_WIDTH;

export const PRINTER_LINE_WIDTH = RECEIPT_LINE_WIDTH;

export { LOGO_BITMAP_WIDTH, LOGO_MAX_SIZE, RECEIPT_FONT };

export const RECEIPT_DIVIDER = "-".repeat(LINE_WIDTH);

export const CALIBRATION_LINE = "1".repeat(LINE_WIDTH);

export type ReceiptAlign = 0 | 1 | 2;

export type ReceiptFontRole = "store" | "heading" | "body" | "total";

export type ReceiptPrintLine = {
  text: string;
  align: ReceiptAlign;
  bold?: boolean;
  font?: ReceiptFontRole;
};

/** Title-case words for printed receipt text. */
export function toReceiptCase(text: string): string {
  return safeStr(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function wrapWords(text: string, width: number = LINE_WIDTH): string[] {
  const words = safeStr(text).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);

    if (word.length <= width) {
      current = word;
    } else {
      let rest = word;
      while (rest.length > width) {
        lines.push(rest.substring(0, width));
        rest = rest.substring(width);
      }
      current = rest;
    }
  }

  if (current) lines.push(current);
  return lines;
}

export function centerLines(text: string, width: number = LINE_WIDTH): string[] {
  return wrapWords(text, width).map((line) => centerText(line, width));
}

export function formatRow(label: string, value: unknown, width: number = LINE_WIDTH): string {
  const valueStr = safeStr(value);
  const labelStr = safeStr(label);

  if (labelStr.length + valueStr.length >= width) {
    const maxLabel = Math.max(1, width - valueStr.length - 1);
    return `${labelStr.substring(0, maxLabel)} ${valueStr}`;
  }

  const spaces = width - labelStr.length - valueStr.length;
  return labelStr + " ".repeat(spaces) + valueStr;
}

/** @deprecated Use formatRow — kept for NYX callers migrating off tabs. */
export function formatRowForPrinter(label: string, value: unknown): string {
  return formatRow(label, value);
}

export function centerText(text: unknown, width: number = LINE_WIDTH): string {
  const trimmed = safeStr(text).substring(0, width);
  if (trimmed.length >= width) return trimmed;
  const spaces = Math.floor((width - trimmed.length) / 2);
  return " ".repeat(spaces) + trimmed;
}

export function clipLine(text: unknown): string {
  return safeStr(text).substring(0, LINE_WIDTH);
}

export function normalizePrintAddress(address: string): string {
  return safeStr(address).trim();
}

export function formatVolumeLtr(volume: unknown): string {
  return `${formatVolume(volume)} Ltr`;
}

export function formatRateRs(rate: unknown): string {
  return `Rs. ${formatCurrency(rate)}`;
}

export function formatTotalRs(amount: unknown): string {
  return `Rs. ${formatCurrency(amount)}`;
}

export function getPaymentLabel(method: string): string {
  if (method === "None" || !method.trim()) return "Cash";
  return toReceiptCase(method);
}

export interface FuelReceiptPrintView {
  storeName: string;
  address: string;
  receiptNo: string;
  date: string;
  time: string;
  paymentMethod: string;
  product: string;
  volume: string;
  rate: string;
  total: string;
  vehicleNo: string;
  logoDataUrl?: string | null;
}

export function mapFuelReceiptToPrintView(data: ReceiptData): FuelReceiptPrintView {
  return {
    storeName: toReceiptCase(data.stationName),
    address: toReceiptCase(normalizePrintAddress(data.stationAddress)),
    receiptNo: safeStr(data.invoiceNumber),
    date: formatDate(safeStr(data.date)),
    time: formatTime(safeStr(data.time)),
    paymentMethod: getPaymentLabel(safeStr(data.paymentMethod)),
    product: toReceiptCase(data.productType),
    volume: formatVolumeLtr(data.volume),
    rate: formatRateRs(data.fuelRate),
    total: formatTotalRs(data.totalAmount),
    vehicleNo: safeStr(data.vehicleNumber).toUpperCase(),
    logoDataUrl: data.logoDataUrl,
  };
}

export function buildReceiptPrintPlan(view: FuelReceiptPrintView): ReceiptPrintLine[] {
  const lines: ReceiptPrintLine[] = [];

  for (const line of centerLines(view.storeName)) {
    lines.push({ text: line, align: 1, bold: true, font: "store" });
  }

  if (view.address) {
    for (const line of centerLines(view.address)) {
      lines.push({ text: line, align: 1, font: "body" });
    }
  }

  lines.push({ text: "Fuel Receipt", align: 1, bold: true, font: "heading" });
  lines.push({ text: RECEIPT_DIVIDER, align: 0, font: "body" });

  lines.push({ text: formatRow("Receipt No", view.receiptNo), align: 0, font: "body" });
  lines.push({ text: formatRow("Date", view.date), align: 0, font: "body" });
  lines.push({ text: formatRow("Time", view.time), align: 0, font: "body" });
  lines.push({ text: formatRow("Payment", view.paymentMethod), align: 0, font: "body" });
  lines.push({ text: RECEIPT_DIVIDER, align: 0, font: "body" });

  lines.push({ text: formatRow("Product", view.product), align: 0, font: "body" });
  lines.push({ text: formatRow("Volume", view.volume), align: 0, font: "body" });
  lines.push({ text: formatRow("Rate/Ltr", view.rate), align: 0, font: "body" });
  lines.push({ text: RECEIPT_DIVIDER, align: 0, font: "body" });

  lines.push({
    text: formatRow("Total Amount", view.total),
    align: 0,
    bold: true,
    font: "total",
  });
  lines.push({ text: RECEIPT_DIVIDER, align: 0, font: "body" });

  if (view.vehicleNo.trim()) {
    lines.push({ text: formatRow("Vehicle No", view.vehicleNo), align: 0, font: "body" });
    lines.push({ text: RECEIPT_DIVIDER, align: 0, font: "body" });
  }

  lines.push({ text: centerText("Powered By Trison"), align: 1, font: "body" });
  lines.push({ text: centerText("Thanks For Fuelling With Us"), align: 1, font: "body" });
  lines.push({ text: centerText("Visit Again"), align: 1, font: "body" });

  return lines;
}

/** Header lines for preview UI (wrapped + centered). */
export function getReceiptHeaderLines(view: FuelReceiptPrintView): {
  storeNameLines: string[];
  addressLines: string[];
  title: string;
} {
  return {
    storeNameLines: centerLines(view.storeName),
    addressLines: view.address ? centerLines(view.address) : [],
    title: "Fuel Receipt",
  };
}

/** Body + footer lines for preview (excludes wrapped header). */
export function buildFuelReceiptBodyLines(view: FuelReceiptPrintView): string[] {
  const plan = buildReceiptPrintPlan(view);
  const headerCount =
    centerLines(view.storeName).length +
    (view.address ? centerLines(view.address).length : 0) +
    1;

  return plan.slice(headerCount).map((line) => line.text);
}

export function buildFuelReceiptTextLines(data: ReceiptData): string[] {
  const view = mapFuelReceiptToPrintView(data);
  return buildReceiptPrintPlan(view).map((line) => line.text);
}
