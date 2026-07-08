import { Platform } from "react-native";
import type { ReceiptData as FuelReceiptData } from "../../utils/generateReceipt";
import {
  printBluetoothDiagnostic,
  initSunmiPrinter,
  isSunmiConnected,
  printSunmiHelloWorld,
  printSunmiReceiptFromFuelData,
  printSunmiTestLine,
} from "./SunmiPrinterService";
import { hasNativePrinterModule } from "./printerNativeModule";

export type DeviceType = "SUNMI";

class PrinterServiceImpl {
  private initialized = false;
  private diagnosticPrinted = false;

  async init(): Promise<DeviceType> {
    if (Platform.OS !== "android") {
      throw new Error("Built-in printer is only available on Android Sunmi devices.");
    }

    if (!hasNativePrinterModule()) {
      throw new Error(
        "Bluetooth printer module missing. Rebuild the APK (npm run build:apk) and install on the Sunmi device."
      );
    }

    const connected = await initSunmiPrinter();
    if (connected && !this.diagnosticPrinted) {
      await printBluetoothDiagnostic().catch(() => undefined);
      this.diagnosticPrinted = true;
    }

    this.initialized = true;
    return "SUNMI";
  }

  getDeviceType(): DeviceType {
    return "SUNMI";
  }

  async initPrinter(): Promise<void> {
    await this.init();
  }

  async getPrinterStatus(): Promise<string> {
    if (!this.initialized) await this.init();
    const connected = await isSunmiConnected();
    if (connected) return "Printer Connected via Bluetooth";
    return "Printer Disconnected";
  }

  private async assertPrinterReady(): Promise<void> {
    if (!this.initialized) await this.init();
    // Native Sunmi service handles its own connection; do NOT open @vardrz Bluetooth.
  }

  async printCalibrationLine(): Promise<void> {
    await this.assertPrinterReady();
    await printSunmiTestLine();
  }

  async printFuelReceipt(data: FuelReceiptData, isDuplicate = false): Promise<void> {
    await this.assertPrinterReady();
    await printSunmiReceiptFromFuelData(data, isDuplicate);
  }

  async printDiagnostic(): Promise<string> {
    await this.assertPrinterReady();
    await printBluetoothDiagnostic();
    return "Diagnostic print sent via Bluetooth";
  }

  async printHelloWorld(): Promise<void> {
    await this.assertPrinterReady();
    await printSunmiHelloWorld();
  }

  async printTestReceipt(): Promise<void> {
    await this.printFuelReceipt({
      stationName: "JEEWAY SHER BROTHERS",
      stationAddress: "Babu Sabu Interchange",
      invoiceNumber: "8036",
      date: "2026-06-07",
      time: "02:49",
      paymentMethod: "Cash",
      productType: "Petrol",
      fuelRate: "379",
      volume: "11",
      totalAmount: 4169,
      vehicleNumber: "",
      customerName: "",
      includeLogoInPrint: false,
    });
  }
}

export const printerService = new PrinterServiceImpl();
export const PrinterService = printerService;

export default printerService;
