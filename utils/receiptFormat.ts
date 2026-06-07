import {
  charsPerLineForFontSize,
  getPreviewStoreFontSize,
  getStoreFontSize,
  LOGO_BITMAP_WIDTH,
  LOGO_MAX_SIZE,
  LOGO_PREVIEW_SIZE,
  RECEIPT_FONT,
  RECEIPT_LINE_WIDTH,
} from "../constants/printerPaper";
import { formatCurrency, formatVolume, safeStr } from "../src/utils/printerUtils";
import { formatDate, formatTime } from "./formatters";
import type { ReceiptData } from "./generateReceipt";

/** Chars per line on 58 mm paper (32 chars @ 24px body). */
export const LINE_WIDTH = RECEIPT_LINE_WIDTH;

export const PRINTER_LINE_WIDTH = RECEIPT_LINE_WIDTH;

export { LOGO_BITMAP_WIDTH, LOGO_MAX_SIZE, LOGO_PREVIEW_SIZE, RECEIPT_FONT };

export const RECEIPT_DIVIDER = "-".repeat(LINE_WIDTH);

export const CALIBRATION_LINE = "1".repeat(LINE_WIDTH);

export const RECEIPT_FOOTER_TEXT = [
  "Powered By Trison",
  "Thanks For Fuelling With Us",
  "Visit Again",
] as const;

export type ReceiptAlign = 0 | 1 | 2;

export type ReceiptFontRole = "store" | "heading" | "body" | "total";

export function lineWidthForRole(role: ReceiptFontRole | undefined): number {
  switch (role) {
    case "store":
      return charsPerLineForFontSize(RECEIPT_FONT.storeName);
    case "heading":
      return charsPerLineForFontSize(RECEIPT_FONT.heading);
    case "total":
      return charsPerLineForFontSize(RECEIPT_FONT.total);
    default:
      return LINE_WIDTH;
  }
}

export type ReceiptPrintLine = {
  text: string;
  align: ReceiptAlign;
  bold?: boolean;
  font?: ReceiptFontRole;
  /** Explicit printer font size (px) — overrides role default. */
  fontSizePx?: number;
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

/**
 * Split address into centered print lines (max 32 chars each).
 * Prefers comma boundaries, then word wrap.
 */
export function splitAddressLines(
  address: string,
  maxChars: number = LINE_WIDTH
): string[] {
  const trimmed = safeStr(address).trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
    const lines: string[] = [];
    for (const part of parts) {
      lines.push(...wrapWords(part, maxChars));
    }
    return lines;
  }

  return wrapWords(trimmed, maxChars);
}

export function centerLines(text: string, width: number = LINE_WIDTH): string[] {
  return wrapWords(text, width).map((line) => centerText(line, width));
}

/**
 * Pad lines to equal width so printer center-align keeps a shared left edge.
 */
export function equalWidthForCenterAlign(lines: string[]): string[] {
  if (lines.length === 0) return [];
  const maxLen = Math.max(...lines.map((line) => line.length));
  return lines.map((line) => line.padEnd(maxLen, " "));
}

function buildStoreNameRows(storeName: string): Array<{
  text: string;
  bold: boolean;
  font: ReceiptFontRole;
  fontSizePx: number;
}> {
  const fontSizePx = getStoreFontSize(storeName);
  const maxChars = charsPerLineForFontSize(fontSizePx);
  const lines =
    storeName.length <= maxChars ? [storeName] : wrapWords(storeName, maxChars);

  return lines.map((text) => ({
    text,
    bold: true,
    font: "store",
    fontSizePx,
  }));
}

function buildHeaderRawLines(view: FuelReceiptPrintView): Array<{
  text: string;
  bold?: boolean;
  font?: ReceiptFontRole;
  fontSizePx?: number;
}> {
  const rows: Array<{
    text: string;
    bold?: boolean;
    font?: ReceiptFontRole;
    fontSizePx?: number;
  }> = [...buildStoreNameRows(view.storeName)];

  if (view.address) {
    for (const line of splitAddressLines(view.address)) {
      rows.push({ text: line, font: "body", fontSizePx: RECEIPT_FONT.body });
    }
  }

  rows.push({
    text: "Fuel Receipt",
    bold: true,
    font: "heading",
    fontSizePx: RECEIPT_FONT.heading,
  });

  return rows;
}

function buildHeaderPrintLines(view: FuelReceiptPrintView): ReceiptPrintLine[] {
  const raw = buildHeaderRawLines(view);
  const padded = equalWidthForCenterAlign(raw.map((row) => row.text));

  return padded.map((text, index) => ({
    text,
    align: 1 as ReceiptAlign,
    bold: raw[index].bold,
    font: raw[index].font,
    fontSizePx: raw[index].fontSizePx,
  }));
}

function countHeaderLines(view: FuelReceiptPrintView): number {
  return buildHeaderRawLines(view).length;
}

function buildFooterPrintLines(): ReceiptPrintLine[] {
  const padded = equalWidthForCenterAlign([...RECEIPT_FOOTER_TEXT]);
  return padded.map((text) => ({
    text,
    align: 1 as ReceiptAlign,
    font: "body" as ReceiptFontRole,
    fontSizePx: RECEIPT_FONT.body,
  }));
}

function countFooterLines(): number {
  return RECEIPT_FOOTER_TEXT.length;
}

export function formatRow(label: string, value: unknown, width: number = LINE_WIDTH): string {
  const labelStr = safeStr(label);
  const valueStr = safeStr(value);

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
  const leftSpaces = Math.floor((width - trimmed.length) / 2);
  return " ".repeat(leftSpaces) + trimmed;
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
  const lines: ReceiptPrintLine[] = [...buildHeaderPrintLines(view)];

  lines.push({ text: RECEIPT_DIVIDER, align: 0, font: "body", fontSizePx: RECEIPT_FONT.body });

  lines.push({
    text: formatRow("Receipt No", view.receiptNo),
    align: 0,
    font: "body",
    fontSizePx: RECEIPT_FONT.body,
  });
  lines.push({
    text: formatRow("Date", view.date),
    align: 0,
    font: "body",
    fontSizePx: RECEIPT_FONT.body,
  });
  lines.push({
    text: formatRow("Time", view.time),
    align: 0,
    font: "body",
    fontSizePx: RECEIPT_FONT.body,
  });
  lines.push({
    text: formatRow("Payment", view.paymentMethod),
    align: 0,
    font: "body",
    fontSizePx: RECEIPT_FONT.body,
  });
  lines.push({ text: RECEIPT_DIVIDER, align: 0, font: "body", fontSizePx: RECEIPT_FONT.body });

  lines.push({
    text: formatRow("Product", view.product),
    align: 0,
    font: "body",
    fontSizePx: RECEIPT_FONT.body,
  });
  lines.push({
    text: formatRow("Volume", view.volume),
    align: 0,
    font: "body",
    fontSizePx: RECEIPT_FONT.body,
  });
  lines.push({
    text: formatRow("Rate/Ltr", view.rate),
    align: 0,
    font: "body",
    fontSizePx: RECEIPT_FONT.body,
  });
  lines.push({ text: RECEIPT_DIVIDER, align: 0, font: "body", fontSizePx: RECEIPT_FONT.body });

  lines.push({
    text: formatRow("Total Amount", view.total),
    align: 0,
    bold: true,
    font: "total",
    fontSizePx: RECEIPT_FONT.total,
  });
  lines.push({ text: RECEIPT_DIVIDER, align: 0, font: "body", fontSizePx: RECEIPT_FONT.body });

  if (view.vehicleNo.trim()) {
    lines.push({
      text: formatRow("Vehicle No", view.vehicleNo),
      align: 0,
      font: "body",
      fontSizePx: RECEIPT_FONT.body,
    });
    lines.push({ text: RECEIPT_DIVIDER, align: 0, font: "body", fontSizePx: RECEIPT_FONT.body });
  }

  lines.push(...buildFooterPrintLines());

  return lines;
}

/** Header display data for preview UI. */
export function getReceiptHeaderLines(view: FuelReceiptPrintView): {
  storeName: string;
  storeFontSize: number;
  storeNameLines: string[];
  addressLines: string[];
  title: string;
} {
  const storeFontSize = getPreviewStoreFontSize(view.storeName);
  const printerStoreSize = getStoreFontSize(view.storeName);
  const maxChars = charsPerLineForFontSize(printerStoreSize);
  const storeNameLines =
    view.storeName.length <= maxChars
      ? [view.storeName]
      : wrapWords(view.storeName, maxChars);
  const addressLines = splitAddressLines(view.address);
  const raw = [...storeNameLines, ...addressLines, "Fuel Receipt"];
  const padded = equalWidthForCenterAlign(raw);

  const storeCount = storeNameLines.length;
  const addressCount = addressLines.length;

  return {
    storeName: view.storeName,
    storeFontSize,
    storeNameLines: padded.slice(0, storeCount),
    addressLines: padded.slice(storeCount, storeCount + addressCount),
    title: padded[padded.length - 1] ?? "Fuel Receipt",
  };
}

/** Footer lines for preview UI (equal width for center display). */
export function getReceiptFooterLines(): string[] {
  return equalWidthForCenterAlign([...RECEIPT_FOOTER_TEXT]);
}

/** Body lines for preview (excludes header and footer). */
export function buildFuelReceiptBodyLines(view: FuelReceiptPrintView): string[] {
  const plan = buildReceiptPrintPlan(view);
  const headerCount = countHeaderLines(view);
  const footerCount = countFooterLines();

  return plan.slice(headerCount, plan.length - footerCount).map((line) => line.text);
}

export function buildFuelReceiptTextLines(data: ReceiptData): string[] {
  const view = mapFuelReceiptToPrintView(data);
  return buildReceiptPrintPlan(view).map((line) => line.text);
}

export { getPreviewStoreFontSize, getStoreFontSize } from "../constants/printerPaper";
