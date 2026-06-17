import type { ReceiptData } from "../../utils/generateReceipt";
import { mapFuelReceiptToPrintView } from "../../utils/receiptFormat";
import { formatCurrency, formatVolume } from "../utils/printerUtils";
import {
  connectInnerPrinter,
  isInnerPrinterConnected,
  printDiagnostic as btPrintDiagnostic,
  printReceipt as btPrintReceipt,
  printTestLine as btPrintTestLine,
} from "./BluetoothPrinterService";

export interface SunmiReceiptData {
  storeName: string;
  address: string;
  dateTime: string;
  product: string;
  volume: string;
  rate: string;
  total: string;
  vehicleNo?: string;
  lubricantName?: string;
  stationPhone?: string;
  logoBase64?: string;
}

export async function initSunmiPrinter(): Promise<boolean> {
  return connectInnerPrinter();
}

export async function isSunmiConnected(): Promise<boolean> {
  if (isInnerPrinterConnected()) return true;
  return connectInnerPrinter();
}

export async function getSunmiPrinterStatus(): Promise<string> {
  const connected = await isSunmiConnected();
  return connected ? "CONNECTED" : "DISCONNECTED";
}

export async function printSunmiReceipt(
  data: SunmiReceiptData,
  isDuplicate = false
): Promise<void> {
  await btPrintReceipt(
    {
      storeName: data.storeName,
      address: data.address,
      dateTime: data.dateTime,
      product: data.product,
      volume: data.volume,
      rate: data.rate,
      total: data.total,
      vehicleNo: data.vehicleNo,
      lubricantName: data.lubricantName,
      stationPhone: data.stationPhone,
    },
    isDuplicate
  );
}

export async function printSunmiReceiptFromFuelData(
  data: ReceiptData,
  isDuplicate = false
): Promise<void> {
  const view = mapFuelReceiptToPrintView(data);
  const dateTime = `${view.date}  ${view.time}`;

  await printSunmiReceipt(
    {
      storeName: view.storeName,
      address: view.address,
      dateTime,
      product: view.product,
      volume: data.productType === "Car Service" || data.productType === "Lubricants"
        ? ""
        : formatVolume(data.volume),
      rate: data.productType === "Car Service"
        ? ""
        : formatCurrency(data.fuelRate),
      total: data.productType === "Car Service"
        ? ""
        : formatCurrency(data.totalAmount),
      vehicleNo: view.vehicleNo.trim() || undefined,
      lubricantName: view.lubricantName,
      stationPhone: data.stationPhone?.trim() || undefined,
    },
    isDuplicate
  );
}

export async function printSunmiHelloWorld(): Promise<void> {
  await btPrintDiagnostic();
}

export async function printSunmiTestLine(): Promise<void> {
  await btPrintTestLine();
}

/** Alias for test print from printer setup. */
export const testPrint = printSunmiTestLine;

export { connectInnerPrinter, printDiagnostic as printBluetoothDiagnostic } from "./BluetoothPrinterService";
