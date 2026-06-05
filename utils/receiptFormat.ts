import {
  centerText,
  formatCurrency,
  formatDate,
  formatTime,
} from "./formatters";
import { receiptWidth } from "../constants/theme";
import type { ReceiptData } from "./generateReceipt";

export const RECEIPT_DIVIDER = "-".repeat(receiptWidth);

/** Column layout for 58mm paper (~32 monospace chars). */
export function formatRow(label: string, value: string, width = receiptWidth): string {
  const spaces = width - label.length - value.length;
  return label + " ".repeat(Math.max(1, spaces)) + value;
}

/** Strip branding prefixes/suffixes for the printed address line. */
export function normalizePrintAddress(address: string): string {
  return address
    .replace(/^PSO\s+pump\s+/i, "")
    .replace(/,?\s*Lahore\s*$/i, "")
    .trim();
}

export function formatVolumeLtr(volume: string | number): string {
  const num = typeof volume === "string" ? parseFloat(volume) : volume;
  if (isNaN(num)) return "0 LTR";
  const text = num % 1 === 0 ? String(Math.round(num)) : num.toFixed(2);
  return `${text} LTR`;
}

export function formatRateRs(rate: string | number): string {
  const num = typeof rate === "string" ? parseFloat(rate) : rate;
  if (isNaN(num)) return "Rs. 0.00";
  return `Rs. ${num.toFixed(2)}`;
}

export function formatTotalRs(amount: number): string {
  return formatCurrency(amount);
}

export function getPaymentLabel(method: string): string {
  return method === "None" ? "CASH" : method.toUpperCase();
}

/** Text lines for preview / ESC-POS (logo printed separately). */
export function buildFuelReceiptTextLines(data: ReceiptData): string[] {
  const lines: string[] = [];
  const address = normalizePrintAddress(data.stationAddress);
  const payment = getPaymentLabel(data.paymentMethod);

  lines.push(centerText(data.stationName.toUpperCase()));
  if (address) {
    lines.push(centerText(address));
  }
  lines.push(centerText("FUEL RECEIPT"));
  lines.push(RECEIPT_DIVIDER);
  lines.push(formatRow("RECEIPT NO:", data.invoiceNumber));
  lines.push(formatRow("DATE:", formatDate(data.date)));
  lines.push(formatRow("TIME:", formatTime(data.time)));
  lines.push(formatRow("PAYMENT:", payment));
  lines.push(RECEIPT_DIVIDER);
  lines.push(formatRow("PRODUCT:", data.productType.toUpperCase()));
  lines.push(formatRow("VOLUME:", formatVolumeLtr(data.volume)));
  lines.push(formatRow("RATE/LTR:", formatRateRs(data.fuelRate)));
  lines.push(RECEIPT_DIVIDER);
  lines.push(formatRow("TOTAL AMOUNT:", formatTotalRs(data.totalAmount)));
  lines.push(RECEIPT_DIVIDER);
  if (data.vehicleNumber.trim()) {
    lines.push(formatRow("VEHICLE NO:", data.vehicleNumber));
    lines.push(RECEIPT_DIVIDER);
  }
  lines.push(centerText("POWERED BY TRISON"));
  lines.push(centerText("THANKS FOR FUELLING WITH US"));
  lines.push(centerText("VISIT AGAIN"));

  return lines;
}
