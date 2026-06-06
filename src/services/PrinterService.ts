import { NativeModules, Platform } from "react-native";
import { LOGO_MAX_SIZE, RECEIPT_LINE_SPACING } from "../../constants/printerPaper";
import type { ReceiptData as FuelReceiptData } from "../../utils/generateReceipt";
import { bufferToBase64, generateEscPosBuffer } from "../../utils/generateReceipt";
import {
  buildReceiptPrintPlan,
  CALIBRATION_LINE,
  LINE_WIDTH,
  mapFuelReceiptToPrintView,
  RECEIPT_DIVIDER,
  RECEIPT_FONT,
  type ReceiptFontRole,
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
    lineSpacing: RECEIPT_LINE_SPACING,
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
  const label = code < 0 ? "Error" : mapStatusCode(code, deviceType);
  throw new Error(`${action} failed: ${label} (code ${code})`);
}

type LineStyle = {
  textSize: number;
  bold?: boolean;
  align?: 0 | 1 | 2;
};

function fontSizeForRole(role: ReceiptFontRole | undefined): number {
  switch (role) {
    case "store":
      return FONT.storeName;
    case "heading":
      return FONT.heading;
    case "total":
      return FONT.total;
    default:
      return FONT.body;
  }
}

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
    await delay(this.deviceType === "SUNMI" ? 2000 : SERVICE_BIND_MS);
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
    if (this.deviceType === "SUNMI") {
      const connected = await UnifiedPrinterModule.isConnected();
      if (!connected) throw new Error("Sunmi printer service not connected");
      return;
    }
    const status = await this.getPrinterStatus();
    if (status === "Out of paper") throw new Error("Printer is out of paper");
    if (status.startsWith("Error")) throw new Error(`Printer status: ${status}`);
  }

  private async printSunmiRaw(data: FuelReceiptData): Promise<void> {
    if (data.includeLogoInPrint && data.logoDataUrl) {
      await printLogo({
        logoUri: data.logoDataUrl,
        maxSize: LOGO_MAX_SIZE,
        align: 1,
        includeLogoInPrint: data.includeLogoInPrint,
      }).catch(() => false);
    }

    const buffer = generateEscPosBuffer(data);
    const code = await UnifiedPrinterModule.printRawDataBase64(bufferToBase64(buffer));
    assertResult(code, "Print", this.deviceType);
  }

  private async printLine(text: unknown, style: LineStyle): Promise<void> {
    const line = safeStr(text);
    const code = await UnifiedPrinterModule.printText(`${line}\n`, buildTextFormat(style));
    assertResult(code, "Print", this.deviceType);
  }

  private async printPlannedLine(line: {
    text: string;
    align: 0 | 1 | 2;
    bold?: boolean;
    font?: ReceiptFontRole;
  }): Promise<void> {
    await this.printLine(line.text, {
      textSize: fontSizeForRole(line.font),
      bold: line.bold,
      align: line.align,
    });
  }

  private async printDivider(): Promise<void> {
    await this.printPlannedLine({ text: RECEIPT_DIVIDER, align: 0, font: "body" });
  }

  private async printFuelReceiptContent(view: ReturnType<typeof mapFuelReceiptToPrintView>): Promise<void> {
    for (const line of buildReceiptPrintPlan(view)) {
      await this.printPlannedLine(line);
    }
  }

  async printCalibrationLine(): Promise<void> {
    await this.assertPrinterReady();
    if (this.deviceType === "SUNMI") {
      const text = [
        `WIDTH TEST (${LINE_WIDTH} chars):`,
        CALIBRATION_LINE,
        RECEIPT_DIVIDER,
        "",
      ].join("\n");
      const bytes = new TextEncoder().encode(`\x1b\x40${text}\n\x1b\x64\x04`);
      const code = await UnifiedPrinterModule.printRawDataBase64(bufferToBase64(bytes));
      assertResult(code, "Print", this.deviceType);
      return;
    }

    await this.printPlannedLine({
      text: `Width Test (${LINE_WIDTH} chars):`,
      align: 0,
      font: "body",
    });
    await this.printPlannedLine({ text: CALIBRATION_LINE, align: 0, font: "body" });
    await this.printDivider();
    const feedCode = await UnifiedPrinterModule.paperOut(FEED_LINES);
    assertResult(feedCode, "Paper feed", this.deviceType);
  }

  async printFuelReceipt(data: FuelReceiptData): Promise<void> {
    await this.assertPrinterReady();

    if (this.deviceType === "SUNMI") {
      await this.printSunmiRaw(data);
      return;
    }

    if (data.includeLogoInPrint && data.logoDataUrl) {
      await printLogo({
        logoUri: data.logoDataUrl,
        maxSize: LOGO_MAX_SIZE,
        align: 1,
        includeLogoInPrint: data.includeLogoInPrint,
      }).catch(() => false);
    }

    const view = mapFuelReceiptToPrintView(data);
    await this.printFuelReceiptContent(view);

    for (let i = 0; i < FEED_LINES; i++) {
      await this.printPlannedLine({ text: "", align: 0, font: "body" });
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
