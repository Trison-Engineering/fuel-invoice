import { NativeModules, Platform } from "react-native";
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

const { UnifiedPrinterModule } = NativeModules;

export type DeviceType = "SUNMI" | "NYX" | "UNKNOWN";

const SDK_OK = 0;
const PRN_NO_PAPER = -1203;
const SERVICE_BIND_MS = 600;
const MONOSPACE = 4;
const FEED_LINES = 4;

const FONT = RECEIPT_FONT;

type TextFormatMap = {
  textSize: number;
  textScaleX: number;
  textScaleY: number;
  letterSpacing: number;
  lineSpacing: number;
  topPadding: number;
  leftPadding: number;
  style: number;
  align: number;
  font: number;
  underline: boolean;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTextFormat(style: {
  textSize: number;
  bold?: boolean;
  align?: 0 | 1 | 2;
}): TextFormatMap {
  return {
    textSize: style.textSize,
    textScaleX: 1,
    textScaleY: 1,
    letterSpacing: 0,
    lineSpacing: 2,
    topPadding: 0,
    leftPadding: 0,
    style: style.bold ? 1 : 0,
    align: style.align ?? 0,
    font: MONOSPACE,
    underline: false,
  };
}

function mapStatusCode(code: number, deviceType: DeviceType): string {
  if (deviceType === "SUNMI") {
    if (code === 1) return "Normal";
    if (code === 2) return "Preparing";
    if (code === 3) return "Error";
    if (code === 4) return "Out of paper";
    if (code === 0) return "Disconnected";
    return "Unknown";
  }

  if (code === SDK_OK) return "Normal";
  if (code === PRN_NO_PAPER) return "Out of paper";
  if (code < 0) return "Error";
  return "Normal";
}

function assertResult(code: number, action: string, deviceType: DeviceType): void {
  if (code === SDK_OK) return;
  throw new Error(`${action} failed: ${mapStatusCode(code, deviceType)} (code ${code})`);
}

type LineStyle = {
  textSize: number;
  bold?: boolean;
  align?: 0 | 1 | 2;
};

class PrinterServiceImpl {
  private initialized = false;
  private deviceType: DeviceType = "UNKNOWN";

  async init(): Promise<DeviceType> {
    if (Platform.OS !== "android") {
      throw new Error("Built-in printer is only available on Android POS devices.");
    }

    if (!UnifiedPrinterModule) {
      throw new Error("UnifiedPrinterModule is not available in this build.");
    }

    const type = (await UnifiedPrinterModule.getDeviceType()) as DeviceType;
    this.deviceType = type;
    console.log(`Printer initialized for device: ${type}`);

    await UnifiedPrinterModule.initPrinter();
    await delay(SERVICE_BIND_MS);
    this.initialized = true;
    return this.deviceType;
  }

  getDeviceType(): DeviceType {
    return this.deviceType;
  }

  async initPrinter(): Promise<void> {
    await this.init();
  }

  async getPrinterStatus(): Promise<string> {
    if (!this.initialized) await this.init();
    const code = await UnifiedPrinterModule.getPrinterStatus();
    return mapStatusCode(code, this.deviceType);
  }

  private async assertPrinterReady(): Promise<void> {
    if (!this.initialized) await this.init();
    const status = await this.getPrinterStatus();
    if (status === "Out of paper") throw new Error("Printer is out of paper");
    if (status.startsWith("Error")) throw new Error(`Printer status: ${status}`);
  }

  private async printLine(text: unknown, style: LineStyle): Promise<void> {
    const line = clipLine(safeStr(text));
    const code = await UnifiedPrinterModule.printText(`${line}\n`, buildTextFormat(style));
    assertResult(code, "Print", this.deviceType);
  }

  private async printBodyLine(text: unknown, bold = false): Promise<void> {
    await this.printLine(text, { textSize: FONT.body, bold, align: 0 });
  }

  private async printDivider(): Promise<void> {
    await this.printBodyLine(RECEIPT_DIVIDER);
  }

  private async printFuelReceiptContent(view: FuelReceiptPrintView): Promise<void> {
    await this.printLine(view.storeName, {
      textSize: FONT.storeName,
      bold: true,
      align: 1,
    });

    if (view.address) {
      await this.printLine(view.address, { textSize: FONT.body, align: 1 });
    }

    await this.printLine("FUEL RECEIPT", {
      textSize: FONT.heading,
      bold: true,
      align: 1,
    });

    await this.printDivider();
    await this.printBodyLine(formatRowForPrinter("RECEIPT NO:", view.receiptNo));
    await this.printBodyLine(formatRowForPrinter("DATE:", view.date));
    await this.printBodyLine(formatRowForPrinter("TIME:", view.time));
    await this.printBodyLine(formatRowForPrinter("PAYMENT:", view.paymentMethod));
    await this.printDivider();

    await this.printBodyLine(formatRowForPrinter("PRODUCT:", view.product));
    await this.printBodyLine(formatRowForPrinter("VOLUME:", view.volume));
    await this.printBodyLine(formatRowForPrinter("RATE/LTR:", view.rate));
    await this.printDivider();

    await this.printLine(formatRowForPrinter("TOTAL AMOUNT:", view.total), {
      textSize: FONT.total,
      bold: true,
      align: 0,
    });
    await this.printDivider();

    if (view.vehicleNo.trim()) {
      await this.printBodyLine(formatRowForPrinter("VEHICLE NO:", view.vehicleNo));
      await this.printDivider();
    }

    await this.printBodyLine(centerText("POWERED BY TRISON"));
    await this.printBodyLine(centerText("THANKS FOR FUELLING WITH US"));
    await this.printBodyLine(centerText("VISIT AGAIN"));
  }

  async printCalibrationLine(): Promise<void> {
    await this.assertPrinterReady();
    await this.printBodyLine(`WIDTH TEST (${LINE_WIDTH} chars):`);
    await this.printBodyLine(CALIBRATION_LINE);
    await this.printDivider();
    const feedCode = await UnifiedPrinterModule.paperOut(FEED_LINES);
    assertResult(feedCode, "Paper feed", this.deviceType);
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
    await this.printFuelReceiptContent(view);

    for (let i = 0; i < FEED_LINES; i++) {
      await this.printBodyLine("");
    }

    const feedCode = await UnifiedPrinterModule.paperOut(FEED_LINES);
    assertResult(feedCode, "Paper feed", this.deviceType);
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

export const printerService = new PrinterServiceImpl();
export const PrinterService = printerService;

/** @deprecated Use printerService or PrinterService */
export const NyxPrinterService = printerService;

export default printerService;
