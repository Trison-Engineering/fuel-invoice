import { Platform } from "react-native";
import {
  multiply,
  NyxTextFormat,
  paperOut,
  printText,
} from "react-native-nyx-printer";
import type { ReceiptData as FuelReceiptData } from "../../utils/generateReceipt";
import {
  formatRateRs,
  formatRow,
  formatTotalRs,
  formatVolumeLtr,
  getPaymentLabel,
  normalizePrintAddress,
  RECEIPT_DIVIDER,
} from "../../utils/receiptFormat";
import { formatDate, formatTime } from "../../utils/formatters";
import { printReceiptLogo } from "../../utils/printReceiptLogo";

export interface ReceiptData {
  storeName: string;
  address?: string;
  date: string;
  time: string;
  receiptNo: string;
  items: Array<{
    name: string;
    qty: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  tax?: number;
  discount?: number;
  total: number;
  paymentMethod: string;
  footer?: string;
}

/** NYX printer service result codes (from SdkResult.java). */
const SDK_OK = 0;
const PRN_NO_PAPER = -1203;
const PRN_COVER_OPEN = -1201;
const PRN_OVERHEAT = -1204;
const DEVICE_NOT_CONNECT = -1100;

const SERVICE_BIND_MS = 600;
const MONOSPACE_FONT = 4;
const FEED_LINES = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapStatusCode(code: number): string {
  if (code === SDK_OK) return "Normal";
  if (code === PRN_NO_PAPER) return "Out of paper";
  if (code === PRN_COVER_OPEN) return "Error (cover open)";
  if (code === PRN_OVERHEAT) return "Error (overheat)";
  if (code === DEVICE_NOT_CONNECT) return "Error (not connected)";
  if (code < 0) return "Error";
  return "Normal";
}

function assertResult(code: number, action: string): void {
  const status = mapStatusCode(code);
  if (code === SDK_OK) return;
  throw new Error(`${action} failed: ${status} (code ${code})`);
}

function createFormat(options: {
  align?: "left" | "center" | "right";
  bold?: boolean;
  large?: boolean;
  small?: boolean;
  monospace?: boolean;
}): NyxTextFormat {
  const format = new NyxTextFormat();
  format.align =
    options.align === "center" ? 1 : options.align === "right" ? 2 : 0;
  format.style = options.bold ? 1 : 0;
  format.textSize = options.large ? 30 : options.small ? 20 : 24;
  format.textScaleX = options.large ? 1.2 : 1;
  format.textScaleY = options.large ? 1.2 : 1;
  format.lineSpacing = 6;
  format.font = options.monospace !== false ? MONOSPACE_FONT : 0;
  return format;
}

async function printLine(
  text: string,
  options: {
    align?: "left" | "center" | "right";
    bold?: boolean;
    large?: boolean;
    small?: boolean;
    monospace?: boolean;
  } = {}
): Promise<void> {
  const format = createFormat(options);
  const code = await printText(text.endsWith("\n") ? text : `${text}\n`, format);
  assertResult(code, "Print");
}

async function printDivider(): Promise<void> {
  await printLine(RECEIPT_DIVIDER);
}

class NyxPrinterServiceImpl {
  private initialized = false;

  async initPrinter(): Promise<void> {
    if (Platform.OS !== "android") {
      throw new Error("Built-in NYX printer is only available on Android POS devices.");
    }

    await multiply(1, 1);
    await delay(SERVICE_BIND_MS);
    this.initialized = true;
  }

  async getPrinterStatus(): Promise<string> {
    if (!this.initialized) {
      await this.initPrinter();
    }

    const format = new NyxTextFormat();
    format.textSize = 20;
    format.align = 0;
    const code = await printText("\n", format);
    return mapStatusCode(code);
  }

  private async assertPrinterReady(): Promise<void> {
    if (!this.initialized) {
      await this.initPrinter();
    }

    const status = await this.getPrinterStatus();
    if (status === "Out of paper") {
      throw new Error("Printer is out of paper");
    }
    if (status.startsWith("Error")) {
      throw new Error(`Printer status: ${status}`);
    }
  }

  async printFuelReceipt(data: FuelReceiptData): Promise<void> {
    await this.assertPrinterReady();

    await printReceiptLogo({
      logoDataUrl: data.logoDataUrl,
      includeLogoInPrint: data.includeLogoInPrint,
    });

    const address = normalizePrintAddress(data.stationAddress);
    const payment = getPaymentLabel(data.paymentMethod);

    await printLine(data.stationName.toUpperCase(), {
      align: "center",
      bold: true,
      large: true,
    });

    if (address) {
      await printLine(address, { align: "center", small: true });
    }

    await printLine("FUEL RECEIPT", { align: "center", bold: true });
    await printDivider();

    await printLine(formatRow("RECEIPT NO:", data.invoiceNumber));
    await printLine(formatRow("DATE:", formatDate(data.date)));
    await printLine(formatRow("TIME:", formatTime(data.time)));
    await printLine(formatRow("PAYMENT:", payment));
    await printDivider();

    await printLine(formatRow("PRODUCT:", data.productType.toUpperCase()));
    await printLine(formatRow("VOLUME:", formatVolumeLtr(data.volume)));
    await printLine(formatRow("RATE/LTR:", formatRateRs(data.fuelRate)));
    await printDivider();

    await printLine(formatRow("TOTAL AMOUNT:", formatTotalRs(data.totalAmount)), {
      bold: true,
    });
    await printDivider();

    if (data.vehicleNumber.trim()) {
      await printLine(formatRow("VEHICLE NO:", data.vehicleNumber));
      await printDivider();
    }

    await printLine("POWERED BY TRISON", { align: "center", small: true });
    await printLine("THANKS FOR FUELLING WITH US", { align: "center", small: true });
    await printLine("VISIT AGAIN", { align: "center", small: true });

    for (let i = 0; i < FEED_LINES; i++) {
      await printLine("");
    }

    const feedCode = await paperOut();
    assertResult(feedCode, "Paper feed");
  }

  async printReceipt(data: ReceiptData): Promise<void> {
    await this.assertPrinterReady();

    await printLine(data.storeName.toUpperCase(), {
      align: "center",
      bold: true,
      large: true,
    });

    if (data.address?.trim()) {
      await printLine(data.address, { align: "center", small: true });
    }

    await printLine("FUEL RECEIPT", { align: "center", bold: true });
    await printDivider();
    await printLine(formatRow("RECEIPT NO:", data.receiptNo));
    await printLine(formatRow("DATE:", data.date));
    await printLine(formatRow("TIME:", data.time));
    await printLine(formatRow("PAYMENT:", data.paymentMethod));
    await printDivider();

    for (const item of data.items) {
      await printLine(formatRow("PRODUCT:", item.name.toUpperCase()));
      await printLine(formatRow("VOLUME:", formatVolumeLtr(item.qty)));
      await printLine(formatRow("RATE/LTR:", formatRateRs(item.price)));
    }

    if (data.items.length > 0) {
      await printDivider();
    }

    await printLine(formatRow("TOTAL AMOUNT:", formatTotalRs(data.total)), { bold: true });
    await printDivider();
    await printLine("POWERED BY TRISON", { align: "center", small: true });
    await printLine(data.footer ?? "THANKS FOR FUELLING WITH US", {
      align: "center",
      small: true,
    });
    await printLine("VISIT AGAIN", { align: "center", small: true });

    for (let i = 0; i < FEED_LINES; i++) {
      await printLine("");
    }

    const feedCode = await paperOut();
    assertResult(feedCode, "Paper feed");
  }

  async printTestReceipt(): Promise<void> {
    await this.printFuelReceipt({
      stationName: "SUN FILLING STATION",
      stationAddress: "PSO pump Bhini Interchange Ring Road Lahore",
      invoiceNumber: "1003",
      date: "2026-05-21",
      time: "12:24",
      paymentMethod: "Cash",
      productType: "Diesel",
      fuelRate: "411.75",
      volume: "800",
      totalAmount: 329400,
      vehicleNumber: "AUA-919",
      nozzleNo: "",
      customerName: "",
      includeLogoInPrint: true,
    });
  }
}

export const NyxPrinterService = new NyxPrinterServiceImpl();
