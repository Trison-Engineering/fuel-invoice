import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { formatCurrencyValue, formatDate, wrapText } from "./formatters";
import { ReceiptData } from "./generateReceipt";

const MM_TO_POINTS = 2.83465;
const PAGE_WIDTH_MM = 58;
const LINE_HEIGHT_MM = 3.2;
const SEPARATOR_HEIGHT_MM = 2.5;
const LOGO_HEIGHT_MM = 14;
const PAGE_PADDING_MM = 6;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatVolumeLtr(volume: string): string {
  const n = parseFloat(volume);
  if (isNaN(n)) return `${volume} LTR`;
  const display = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return `${display} LTR`;
}

function formatRateRs(rate: string): string {
  return `Rs. ${formatCurrencyValue(rate)}`;
}

function formatTotalRs(amount: number): string {
  return `Rs. ${formatCurrencyValue(amount)}`;
}

function pdfRow(label: string, value: string): string {
  return `<div class="row"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`;
}

function dashedSeparator(): string {
  return '<div class="separator"></div>';
}

function estimateHeightMm(data: ReceiptData, addressLines: number): number {
  let lines = 0;
  if (data.logoDataUrl) lines += LOGO_HEIGHT_MM / LINE_HEIGHT_MM;
  lines += 1 + addressLines + 1;
  lines += 3 + 3 + 1 + 1;
  if (data.customerName.trim()) lines += 1;
  lines += 4;

  const separatorCount = 6;
  return (
    PAGE_PADDING_MM +
    lines * LINE_HEIGHT_MM +
    separatorCount * SEPARATOR_HEIGHT_MM +
    2
  );
}

function buildHtmlReceipt(data: ReceiptData): { html: string; heightMm: number } {
  const parts: string[] = [];
  const addressLines = wrapText(data.stationAddress);

  if (data.logoDataUrl) {
    parts.push(`<img src="${data.logoDataUrl}" class="logo" alt="Station logo" />`);
  }

  parts.push(`<div class="center title">${escapeHtml(data.stationName.toUpperCase())}</div>`);

  for (const line of addressLines) {
    parts.push(`<div class="center subtitle">${escapeHtml(line)}</div>`);
  }

  parts.push(dashedSeparator());
  parts.push('<div class="center heading">FUEL RECEIPT</div>');
  parts.push(dashedSeparator());

  parts.push(pdfRow("RECEIPT NO:", data.invoiceNumber));
  parts.push(pdfRow("DATE:", formatDate(data.date)));
  parts.push(pdfRow("TIME:", data.time));

  parts.push(dashedSeparator());
  parts.push(pdfRow("PRODUCT:", data.productType.toUpperCase()));
  parts.push(pdfRow("VOLUME:", formatVolumeLtr(data.volume)));
  parts.push(pdfRow("RATE/LTR:", formatRateRs(data.fuelRate)));

  parts.push(dashedSeparator());
  parts.push(pdfRow("TOTAL AMOUNT:", formatTotalRs(data.totalAmount)));

  parts.push(dashedSeparator());
  parts.push(pdfRow("VEHICLE NO:", data.vehicleNumber));

  if (data.customerName.trim()) {
    parts.push(pdfRow("CUSTOMER:", data.customerName));
  }

  parts.push(dashedSeparator());
  parts.push('<div class="center footer">SAVE FUEL YAANI SAVE MONEY</div>');
  parts.push('<div class="center footer">THANKS FOR FUELLING WITH US</div>');
  parts.push('<div class="center footer">VISIT AGAIN</div>');
  parts.push(
    `<div class="center footer trans-id">Trans ID: ${escapeHtml(data.invoiceNumber)}</div>`
  );

  const heightMm = estimateHeightMm(data, addressLines.length);
  const body = parts.join("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page {
      size: ${PAGE_WIDTH_MM}mm ${heightMm}mm;
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${PAGE_WIDTH_MM}mm;
      height: auto;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 9px;
      line-height: 1.35;
      color: #111;
      background: #fff;
      padding: 3mm 2.5mm;
    }
    .logo {
      display: block;
      max-width: 70%;
      max-height: 12mm;
      margin: 0 auto 2mm;
      object-fit: contain;
    }
    .center { text-align: center; }
    .title {
      font-weight: bold;
      font-size: 10px;
      letter-spacing: 0.3px;
      margin-bottom: 1mm;
    }
    .subtitle {
      font-size: 9px;
      margin-bottom: 0.5mm;
    }
    .heading {
      font-weight: bold;
      font-size: 9px;
      margin: 1mm 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 2mm;
      margin: 0.8mm 0;
      font-size: 9px;
    }
    .label { flex-shrink: 0; }
    .value {
      text-align: right;
      flex: 1;
      word-break: break-word;
    }
    .separator {
      border: none;
      border-top: 1px dashed #444;
      margin: 1.5mm 0;
      height: 0;
      width: 100%;
    }
    .footer {
      font-size: 8.5px;
      margin: 0.6mm 0;
    }
    .trans-id {
      margin-top: 1.5mm;
      font-size: 8.5px;
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;

  return { html, heightMm };
}

export async function generateAndSharePDF(data: ReceiptData): Promise<void> {
  const { html, heightMm } = buildHtmlReceipt(data);
  const widthPoints = PAGE_WIDTH_MM * MM_TO_POINTS;
  const heightPoints = Math.ceil(heightMm * MM_TO_POINTS);

  const { uri } = await Print.printToFileAsync({
    html,
    width: widthPoints,
    height: heightPoints,
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
