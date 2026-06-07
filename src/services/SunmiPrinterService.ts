import type { ReceiptData } from "../../utils/generateReceipt";
import { mapFuelReceiptToPrintView } from "../../utils/receiptFormat";
import { formatCurrency, formatVolume, safeStr } from "../utils/printerUtils";
import { resolveLogoBase64 } from "../utils/printLogoUtil";
import {
  getPrinterModule,
  waitForPrinterConnection,
} from "./printerNativeModule";

export interface SunmiReceiptData {
  storeName: string;
  address: string;
  receiptNo: string;
  date: string;
  time: string;
  payment: string;
  product: string;
  volume: string;
  rate: string;
  total: string;
  vehicleNo?: string;
  logoBase64?: string;
}

export async function isSunmiConnected(): Promise<boolean> {
  try {
    const printer = getPrinterModule();
    if (!printer.isConnected) return false;
    return Boolean(await printer.isConnected());
  } catch {
    return false;
  }
}

export async function getSunmiPrinterStatus(): Promise<string> {
  try {
    const printer = getPrinterModule();
    if (!printer.getPrinterStatus) return "UNKNOWN";
    const status = await printer.getPrinterStatus();
    if (typeof status === "string") return status;
    if (status === 1) return "NORMAL";
    if (status === 4) return "NO_PAPER";
    if (status === 0) return "DISCONNECTED";
    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

export async function printSunmiReceipt(data: SunmiReceiptData): Promise<void> {
  const printer = getPrinterModule();

  if (!printer.printReceipt) {
    throw new Error(
      "printReceipt is not available on SunmiPrinterModule. Please rebuild the app."
    );
  }

  // Best-effort connection check — native printReceipt retries bind/wait up to 8s
  await waitForPrinterConnection(3);

  await printer.printReceipt(
    safeStr(data.logoBase64),
    safeStr(data.storeName),
    safeStr(data.address),
    safeStr(data.receiptNo),
    safeStr(data.date),
    safeStr(data.time),
    safeStr(data.payment),
    safeStr(data.product),
    safeStr(data.volume),
    safeStr(data.rate),
    safeStr(data.total),
    safeStr(data.vehicleNo ?? "")
  );
}

export async function printSunmiReceiptFromFuelData(data: ReceiptData): Promise<void> {
  const view = mapFuelReceiptToPrintView(data);

  let logoBase64 = "";
  if (data.includeLogoInPrint && data.logoDataUrl) {
    logoBase64 = (await resolveLogoBase64(data.logoDataUrl).catch(() => null)) ?? "";
  }

  await printSunmiReceipt({
    logoBase64,
    storeName: view.storeName,
    address: view.address,
    receiptNo: view.receiptNo,
    date: view.date,
    time: view.time,
    payment: view.paymentMethod,
    product: view.product,
    volume: formatVolume(data.volume),
    rate: formatCurrency(data.fuelRate),
    total: formatCurrency(data.totalAmount),
    vehicleNo: view.vehicleNo,
  });
}

export async function printSunmiTestLine(): Promise<void> {
  const printer = getPrinterModule();

  if (!printer.printTestLine) {
    throw new Error("printTestLine is not available on SunmiPrinterModule");
  }

  await waitForPrinterConnection(3);
  await printer.printTestLine();
}
