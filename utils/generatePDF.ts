import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  centerText,
  formatCurrencyValue,
  formatDate,
  formatTime,
  padLabelValue,
  wrapText,
} from "./formatters";
import { ReceiptData } from "./generateReceipt";
import { receiptWidth } from "../constants/theme";

const SEPARATOR = "━".repeat(receiptWidth);
const MM_TO_POINTS = 2.83465;
const PAGE_WIDTH_MM = 58;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtmlReceipt(data: ReceiptData): string {
  const parts: string[] = [];

  if (data.logoDataUrl) {
    parts.push(
      `<img src="${data.logoDataUrl}" style="max-width:100%;max-height:80px;display:block;margin:0 auto 8px;" />`
    );
  }

  parts.push(
    `<div class="center bold">${escapeHtml(centerText(data.stationName.toUpperCase()))}</div>`
  );

  for (const line of wrapText(data.stationAddress)) {
    parts.push(`<div class="center">${escapeHtml(line)}</div>`);
  }

  parts.push(`<div class="separator">${SEPARATOR}</div>`);
  parts.push('<div class="center bold">FUEL RECEIPT</div>');
  parts.push(`<div class="separator">${SEPARATOR}</div>`);
  parts.push(
    `<div class="row">${escapeHtml(padLabelValue("RCPT NO:", data.invoiceNumber))}</div>`
  );
  parts.push(
    `<div class="row">${escapeHtml(padLabelValue("DATE:", formatDate(data.date)))}</div>`
  );
  parts.push(
    `<div class="row">${escapeHtml(padLabelValue("TIME:", formatTime(data.time)))}</div>`
  );

  if (data.paymentMethod !== "None") {
    parts.push(
      `<div class="row">${escapeHtml(padLabelValue("PAYMENT:", data.paymentMethod.toUpperCase()))}</div>`
    );
  }

  if (data.nozzleNo.trim()) {
    parts.push(
      `<div class="row">${escapeHtml(padLabelValue("NOZZLE:", data.nozzleNo))}</div>`
    );
  }

  parts.push(`<div class="separator">${SEPARATOR}</div>`);
  parts.push(
    `<div class="row">${escapeHtml(padLabelValue("PRODUCT:", data.productType.toUpperCase()))}</div>`
  );
  parts.push(
    `<div class="row">${escapeHtml(padLabelValue("VOLUME(LTR):", formatCurrencyValue(data.volume)))}</div>`
  );
  parts.push(
    `<div class="row">${escapeHtml(padLabelValue("RATE/LTR(Rs.):", formatCurrencyValue(data.fuelRate)))}</div>`
  );
  parts.push(`<div class="separator">${SEPARATOR}</div>`);
  parts.push(
    `<div class="row total">${escapeHtml(padLabelValue("TOTAL(Rs.):", formatCurrencyValue(data.totalAmount)))}</div>`
  );
  parts.push(`<div class="separator">${SEPARATOR}</div>`);
  parts.push(
    `<div class="row">${escapeHtml(padLabelValue("VEHICLE:", data.vehicleNumber))}</div>`
  );

  if (data.customerName.trim()) {
    parts.push(
      `<div class="row">${escapeHtml(padLabelValue("CUSTOMER:", data.customerName))}</div>`
    );
  }

  parts.push(`<div class="separator">${SEPARATOR}</div>`);
  parts.push('<div class="center">POWERED BY TRISON</div>');
  parts.push('<div class="center">THANKS FOR FUELLING WITH US</div>');
  parts.push('<div class="center">VISIT AGAIN</div>');

  const body = parts.join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      color: #000;
      background: #fff;
      width: ${PAGE_WIDTH_MM}mm;
      padding: 4mm 2mm;
    }
    .center { text-align: center; white-space: pre; }
    .row { white-space: pre; }
    .bold { font-weight: bold; }
    .separator { white-space: pre; text-align: center; margin: 4px 0; }
    .total { font-weight: bold; font-size: 12px; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export async function generateAndSharePDF(data: ReceiptData): Promise<void> {
  const html = buildHtmlReceipt(data);
  const widthPoints = PAGE_WIDTH_MM * MM_TO_POINTS;

  const { uri } = await Print.printToFileAsync({
    html,
    width: widthPoints,
    height: 800,
    base64: false,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `fuel-receipt-${data.invoiceNumber}.pdf`,
      UTI: "com.adobe.pdf",
    });
  }
}
