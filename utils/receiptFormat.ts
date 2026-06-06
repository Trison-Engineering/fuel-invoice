import { formatCurrency, formatVolume, safeStr } from "../src/utils/printerUtils";
import { formatDate, formatTime } from "./formatters";
import type { ReceiptData } from "./generateReceipt";

/** 58mm paper @ NYX textSize 24 — max chars per line without wrapping. */
export const LINE_WIDTH = 32;

export const RECEIPT_DIVIDER = "-".repeat(LINE_WIDTH);

export const CALIBRATION_LINE = "12345678901234567890123456789012";

export function formatRow(label: string, value: unknown): string {
  const totalWidth = LINE_WIDTH;
  const valueStr = safeStr(value);
  const labelStr = safeStr(label);

  if (labelStr.length + valueStr.length >= totalWidth) {
    const maxLabelWidth = totalWidth - valueStr.length - 1;
    return labelStr.substring(0, Math.max(0, maxLabelWidth)) + " " + valueStr;
  }

  const spaces = totalWidth - labelStr.length - valueStr.length;
  return labelStr + " ".repeat(spaces) + valueStr;
}

export function centerText(text: unknown): string {
  const trimmed = safeStr(text).substring(0, LINE_WIDTH);
  if (trimmed.length >= LINE_WIDTH) {
    return trimmed;
  }
  const spaces = Math.floor((LINE_WIDTH - trimmed.length) / 2);
  return " ".repeat(spaces) + trimmed;
}

export function clipLine(text: unknown): string {
  return safeStr(text).substring(0, LINE_WIDTH);
}

export function normalizePrintAddress(address: string): string {
  return address
    .replace(/^PSO\s+pump\s+/i, "")
    .replace(/,?\s*Lahore\s*$/i, "")
    .trim();
}

export function formatVolumeLtr(volume: unknown): string {
  return `${formatVolume(volume)} LTR`;
}

export function formatRateRs(rate: unknown): string {
  return `Rs. ${formatCurrency(rate)}`;
}

export function formatTotalRs(amount: unknown): string {
  return `Rs. ${formatCurrency(amount)}`;
}

export function getPaymentLabel(method: string): string {
  return method === "None" ? "CASH" : method.toUpperCase();
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
    storeName: safeStr(data.stationName).toUpperCase(),
    address: normalizePrintAddress(safeStr(data.stationAddress)),
    receiptNo: safeStr(data.invoiceNumber),
    date: formatDate(safeStr(data.date)),
    time: formatTime(safeStr(data.time)),
    paymentMethod: getPaymentLabel(safeStr(data.paymentMethod)),
    product: safeStr(data.productType).toUpperCase(),
    volume: formatVolumeLtr(data.volume),
    rate: formatRateRs(data.fuelRate),
    total: formatTotalRs(data.totalAmount),
    vehicleNo: safeStr(data.vehicleNumber),
    logoDataUrl: data.logoDataUrl,
  };
}

/** Monospace text lines for preview (header lines returned separately in UI). */
export function buildFuelReceiptBodyLines(view: FuelReceiptPrintView): string[] {
  const lines: string[] = [];

  lines.push(RECEIPT_DIVIDER);
  lines.push(formatRow("RECEIPT NO:", view.receiptNo));
  lines.push(formatRow("DATE:", view.date));
  lines.push(formatRow("TIME:", view.time));
  lines.push(formatRow("PAYMENT:", view.paymentMethod));
  lines.push(RECEIPT_DIVIDER);
  lines.push(formatRow("PRODUCT:", view.product));
  lines.push(formatRow("VOLUME:", view.volume));
  lines.push(formatRow("RATE/LTR:", view.rate));
  lines.push(RECEIPT_DIVIDER);
  lines.push(formatRow("TOTAL AMOUNT:", view.total));
  lines.push(RECEIPT_DIVIDER);

  if (view.vehicleNo.trim()) {
    lines.push(formatRow("VEHICLE NO:", view.vehicleNo));
    lines.push(RECEIPT_DIVIDER);
  }

  lines.push(centerText("POWERED BY TRISON"));
  lines.push(centerText("THANKS FOR FUELLING WITH US"));
  lines.push(centerText("VISIT AGAIN"));

  return lines;
}

export function buildFuelReceiptTextLines(data: ReceiptData): string[] {
  const view = mapFuelReceiptToPrintView(data);
  return [
    centerText(view.storeName),
    centerText(view.address),
    centerText("FUEL RECEIPT"),
    ...buildFuelReceiptBodyLines(view),
  ];
}
