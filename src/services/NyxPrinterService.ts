import { Platform } from "react-native";
import {
  multiply,
  NyxTextFormat,
  paperOut,
  printText,
} from "react-native-nyx-printer";
import type { ReceiptData as FuelReceiptData } from "../../utils/generateReceipt";
import { formatCurrencyValue, formatDate, formatTime } from "../../utils/formatters";
import { receiptWidth } from "../../constants/theme";

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
  /** Extra left-aligned lines printed after receipt header (fuel-specific fields). */
  detailLines?: string[];
}

/** NYX printer service result codes (from SdkResult.java). */
const SDK_OK = 0;
const PRN_NO_PAPER = -1203;
const PRN_COVER_OPEN = -1201;
const PRN_OVERHEAT = -1204;
const DEVICE_NOT_CONNECT = -1100;

const DIVIDER = "-".repeat(receiptWidth);
const SERVICE_BIND_MS = 600;

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

function padLine(left: string, right: string, width = receiptWidth): string {
  const trimmedRight = right.trim();
  const maxLeft = Math.max(1, width - trimmedRight.length - 1);
  const trimmedLeft = left.length > maxLeft ? left.slice(0, maxLeft) : left;
  const spaces = Math.max(1, width - trimmedLeft.length - trimmedRight.length);
  return trimmedLeft + " ".repeat(spaces) + trimmedRight;
}

function formatWithStyle(
  text: string,
  options: {
    align?: "left" | "center" | "right";
    bold?: boolean;
    large?: boolean;
    small?: boolean;
  }
): NyxTextFormat {
  const format = new NyxTextFormat();
  format.align =
    options.align === "center" ? 1 : options.align === "right" ? 2 : 0;
  format.style = options.bold ? 1 : 0;
  format.textSize = options.large ? 32 : options.small ? 20 : 24;
  format.textScaleX = options.large ? 1.15 : 1;
  format.textScaleY = options.large ? 1.15 : 1;
  format.lineSpacing = 4;
  return format;
}

async function printLine(
  text: string,
  options: {
    align?: "left" | "center" | "right";
    bold?: boolean;
    large?: boolean;
    small?: boolean;
  } = {}
): Promise<void> {
  const format = formatWithStyle(text, options);
  const code = await printText(text.endsWith("\n") ? text : `${text}\n`, format);
  assertResult(code, "Print");
}

export function mapFuelReceiptToNyx(data: FuelReceiptData): ReceiptData {
  const detailLines: string[] = [
    padLine("PRODUCT", data.productType.toUpperCase()),
    padLine("VOLUME (LTR)", formatCurrencyValue(data.volume)),
    padLine("RATE/LTR (Rs.)", formatCurrencyValue(data.fuelRate)),
  ];

  if (data.nozzleNo.trim()) {
    detailLines.push(padLine("NOZZLE", data.nozzleNo));
  }
  if (data.vehicleNumber.trim()) {
    detailLines.push(padLine("VEHICLE", data.vehicleNumber));
  }
  if (data.customerName.trim()) {
    detailLines.push(padLine("CUSTOMER", data.customerName));
  }

  return {
    storeName: data.stationName,
    address: data.stationAddress,
    date: formatDate(data.date),
    time: formatTime(data.time),
    receiptNo: data.invoiceNumber,
    items: [],
    subtotal: data.totalAmount,
    total: data.totalAmount,
    paymentMethod: data.paymentMethod === "None" ? "CASH" : data.paymentMethod.toUpperCase(),
    footer: "THANKS FOR FUELLING WITH US",
    detailLines,
  };
}

class NyxPrinterServiceImpl {
  private initialized = false;

  async initPrinter(): Promise<void> {
    if (Platform.OS !== "android") {
      throw new Error("Built-in NYX printer is only available on Android POS devices.");
    }

    // Native module binds to net.nyx.printerservice on load; verify the bridge is reachable.
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

  async printReceipt(data: ReceiptData): Promise<void> {
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

    await printLine(data.storeName.toUpperCase(), {
      align: "center",
      bold: true,
      large: true,
    });

    if (data.address?.trim()) {
      for (const segment of wrapSegments(data.address, receiptWidth)) {
        await printLine(segment, { align: "center", small: true });
      }
    }

    await printLine(DIVIDER);
    await printLine(`Date: ${data.date}`);
    await printLine(`Time: ${data.time}`);
    await printLine(`Receipt No: ${data.receiptNo}`);
    await printLine(DIVIDER);

    if (data.detailLines?.length) {
      for (const line of data.detailLines) {
        await printLine(line);
      }
      await printLine(DIVIDER);
    }

    if (data.items.length > 0) {
      for (const item of data.items) {
        await printLine(padLine(item.name, formatCurrencyValue(item.total)));
        if (item.qty > 0) {
          await printLine(
            `  ${item.qty} x ${formatCurrencyValue(item.price)}`,
            { small: true }
          );
        }
      }
      await printLine(DIVIDER);
    }
    await printLine(padLine("Subtotal", formatCurrencyValue(data.subtotal)));

    if (data.tax != null && data.tax > 0) {
      await printLine(padLine("Tax", formatCurrencyValue(data.tax)));
    }
    if (data.discount != null && data.discount > 0) {
      await printLine(padLine("Discount", formatCurrencyValue(data.discount)));
    }

    await printLine(padLine("TOTAL", formatCurrencyValue(data.total)), { bold: true });
    await printLine(DIVIDER);
    await printLine(`Payment: ${data.paymentMethod}`, { align: "center" });
    await printLine(data.footer ?? "Thank you", { align: "center" });

    const feedCode = await paperOut();
    assertResult(feedCode, "Paper feed");
    await printLine("");
    await printLine("");
  }

  async printTestReceipt(): Promise<void> {
    await this.printReceipt({
      storeName: "Fuel Receipt Test",
      address: "EzPump Handheld POS",
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      receiptNo: "TEST-001",
      items: [
        { name: "Petrol", qty: 10, price: 250, total: 2500 },
        { name: "Diesel", qty: 5, price: 230, total: 1150 },
      ],
      subtotal: 3650,
      tax: 0,
      discount: 0,
      total: 3650,
      paymentMethod: "CASH",
      footer: "NYX test print OK",
    });
  }

  async printFuelReceipt(data: FuelReceiptData): Promise<void> {
    await this.printReceipt(mapFuelReceiptToNyx(data));
  }
}

function wrapSegments(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

export const NyxPrinterService = new NyxPrinterServiceImpl();
