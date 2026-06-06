import { Platform } from "react-native";
import {
  multiply,
  NyxTextFormat,
  paperOut,
  printText,
} from "react-native-nyx-printer";
import type { ReceiptData as FuelReceiptData } from "../../utils/generateReceipt";
import {
  CALIBRATION_LINE,
  centerText,
  clipLine,
  formatRowForPrinter,
  LINE_WIDTH,
  LOGO_BITMAP_WIDTH,
  mapFuelReceiptToPrintView,
  RECEIPT_DIVIDER,
  RECEIPT_FONT,
  type FuelReceiptPrintView,
} from "../../utils/receiptFormat";
import { printLogo } from "../utils/printLogoUtil";
import { safeStr } from "../utils/printerUtils";

const SDK_OK = 0;
const PRN_NO_PAPER = -1203;
const SERVICE_BIND_MS = 600;
const MONOSPACE = 4;
const FEED_LINES = 4;

const FONT = RECEIPT_FONT;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapStatusCode(code: number): string {
  if (code === SDK_OK) return "Normal";
  if (code === PRN_NO_PAPER) return "Out of paper";
  if (code < 0) return "Error";
  return "Normal";
}

function assertResult(code: number, action: string): void {
  if (code === SDK_OK) return;
  throw new Error(`${action} failed: ${mapStatusCode(code)} (code ${code})`);
}

type NyxLineStyle = {
  textSize: number;
  bold?: boolean;
  align?: 0 | 1 | 2;
};

async function nyxPrintLine(text: unknown, style: NyxLineStyle): Promise<void> {
  const format = new NyxTextFormat();
  format.textSize = style.textSize;
  format.textScaleX = 1;
  format.textScaleY = 1;
  format.letterSpacing = 0;
  format.lineSpacing = 2;
  format.topPadding = 0;
  format.leftPadding = 0;
  format.style = style.bold ? 1 : 0;
  format.align = style.align ?? 0;
  format.font = MONOSPACE;
  format.underline = false;

  const line = clipLine(safeStr(text));
  const code = await printText(`${line}\n`, format);
  assertResult(code, "Print");
}

async function printBodyLine(text: unknown, bold = false): Promise<void> {
  await nyxPrintLine(text, { textSize: FONT.body, bold, align: 0 });
}

async function printDivider(): Promise<void> {
  await printBodyLine(RECEIPT_DIVIDER);
}

async function printFuelReceiptContent(view: FuelReceiptPrintView): Promise<void> {
  await nyxPrintLine(view.storeName, {
    textSize: FONT.storeName,
    bold: true,
    align: 1,
  });

  if (view.address) {
    await nyxPrintLine(view.address, { textSize: FONT.body, align: 1 });
  }

  await nyxPrintLine("FUEL RECEIPT", {
    textSize: FONT.heading,
    bold: true,
    align: 1,
  });

  await printDivider();
  await printBodyLine(formatRowForPrinter("RECEIPT NO:", view.receiptNo));
  await printBodyLine(formatRowForPrinter("DATE:", view.date));
  await printBodyLine(formatRowForPrinter("TIME:", view.time));
  await printBodyLine(formatRowForPrinter("PAYMENT:", view.paymentMethod));
  await printDivider();

  await printBodyLine(formatRowForPrinter("PRODUCT:", view.product));
  await printBodyLine(formatRowForPrinter("VOLUME:", view.volume));
  await printBodyLine(formatRowForPrinter("RATE/LTR:", view.rate));
  await printDivider();

  await nyxPrintLine(formatRowForPrinter("TOTAL AMOUNT:", view.total), {
    textSize: FONT.total,
    bold: true,
    align: 0,
  });
  await printDivider();

  if (view.vehicleNo.trim()) {
    await printBodyLine(formatRowForPrinter("VEHICLE NO:", view.vehicleNo));
    await printDivider();
  }

  await printBodyLine(centerText("POWERED BY TRISON"));
  await printBodyLine(centerText("THANKS FOR FUELLING WITH US"));
  await printBodyLine(centerText("VISIT AGAIN"));
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
    if (!this.initialized) await this.initPrinter();
    const format = new NyxTextFormat();
    format.textSize = FONT.body;
    format.align = 0;
    const code = await printText("\n", format);
    return mapStatusCode(code);
  }

  private async assertPrinterReady(): Promise<void> {
    if (!this.initialized) await this.initPrinter();
    const status = await this.getPrinterStatus();
    if (status === "Out of paper") throw new Error("Printer is out of paper");
    if (status.startsWith("Error")) throw new Error(`Printer status: ${status}`);
  }

  async printCalibrationLine(): Promise<void> {
    await this.assertPrinterReady();
    await printBodyLine(`WIDTH TEST (${LINE_WIDTH} chars):`);
    await printBodyLine(CALIBRATION_LINE);
    await printDivider();
    const feedCode = await paperOut();
    assertResult(feedCode, "Paper feed");
  }

  async printFuelReceipt(data: FuelReceiptData): Promise<void> {
    await this.assertPrinterReady();

    if (data.includeLogoInPrint && data.logoDataUrl) {
      await printLogo({
        logoUri: data.logoDataUrl,
        width: LOGO_BITMAP_WIDTH,
        align: 1,
        includeLogoInPrint: data.includeLogoInPrint,
      }).catch(() => false);
    }

    const view = mapFuelReceiptToPrintView(data);
    await printFuelReceiptContent(view);

    for (let i = 0; i < FEED_LINES; i++) {
      await printBodyLine("");
    }

    const feedCode = await paperOut();
    assertResult(feedCode, "Paper feed");
  }

  async printTestReceipt(): Promise<void> {
    await this.printFuelReceipt({
      stationName: "SUN FILLING STATION",
      stationAddress: "PSO pump Bhini Interchange Ring Road Lahore",
      invoiceNumber: "6667",
      date: "2026-06-05",
      time: "10:03",
      paymentMethod: "Cash",
      productType: "Diesel",
      fuelRate: "390",
      volume: "17",
      totalAmount: 6630,
      vehicleNumber: "ASX-428",
      customerName: "",
      includeLogoInPrint: false,
    });
  }
}

export const NyxPrinterService = new NyxPrinterServiceImpl();
