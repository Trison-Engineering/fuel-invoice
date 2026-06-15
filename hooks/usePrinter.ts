import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { printerService } from "../src/services/PrinterService";
import { connectInnerPrinter } from "../src/services/BluetoothPrinterService";
import { hasNativePrinterModule, waitForPrinterConnection } from "../src/services/printerNativeModule";
import type { ReceiptData } from "../utils/generateReceipt";

export type PrinterConnectionStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "warming_up";

export function usePrinter() {
  const [connectionStatus, setConnectionStatus] = useState<PrinterConnectionStatus>("disconnected");
  const [printerStatus, setPrinterStatus] = useState<string>("Checking...");
  const [isInitializing, setIsInitializing] = useState(false);
  const [isTestingPrint, setIsTestingPrint] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectionStatusLabel =
    connectionStatus === "connected"
      ? "Printer Connected via Bluetooth"
      : connectionStatus === "warming_up"
        ? "Printer warming up..."
        : connectionStatus === "connecting"
          ? "Connecting..."
          : "Printer Disconnected";

  const connectionStatusColor =
    connectionStatus === "connected"
      ? "#16A34A"
      : connectionStatus === "warming_up"
        ? "#D97706"
        : connectionStatus === "connecting"
          ? "#6B7280"
          : "#DC2626";

  const refreshStatus = useCallback(async (): Promise<string> => {
    const status = await printerService.getPrinterStatus();
    setPrinterStatus(status);
    return status;
  }, []);

  const initPrinter = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") {
      setError("Built-in printer requires an Android Sunmi POS build.");
      setConnectionStatus("disconnected");
      return false;
    }

    if (!hasNativePrinterModule()) {
      setError("Bluetooth printer module missing — rebuild and install the APK on this device.");
      setConnectionStatus("disconnected");
      return false;
    }

    setIsInitializing(true);
    setConnectionStatus("connecting");
    setError(null);

    try {
      await printerService.init();
      const connected = await waitForPrinterConnection(3);
      const status = await refreshStatus();

      if (connected) {
        setConnectionStatus("connected");
        return true;
      }

      setConnectionStatus("disconnected");
      setError(status === "Printer Disconnected" ? "Could not connect to InnerPrinter via Bluetooth" : status);
      return false;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to initialize printer";
      setError(message);
      setConnectionStatus("disconnected");
      return false;
    } finally {
      setIsInitializing(false);
    }
  }, [refreshStatus]);

  useEffect(() => {
    initPrinter().catch(() => undefined);
  }, [initPrinter]);

  const ensureConnected = useCallback(async (): Promise<boolean> => {
    const connected = await connectInnerPrinter();
    if (connected) {
      setConnectionStatus("connected");
      await refreshStatus();
      return true;
    }
    return initPrinter();
  }, [initPrinter, refreshStatus]);

  const printReceipt = useCallback(
    async (data: ReceiptData, isDuplicate = false): Promise<void> => {
      if (!hasNativePrinterModule()) {
        throw new Error("Bluetooth printer module missing. Rebuild and install the APK.");
      }

      await ensureConnected();

      const status = await refreshStatus();
      if (status === "Printer Disconnected") {
        throw new Error("Could not connect to InnerPrinter via Bluetooth");
      }

      await printerService.printFuelReceipt(data, isDuplicate);
      await refreshStatus();
    },
    [ensureConnected, refreshStatus]
  );

  const printCalibration = useCallback(async (): Promise<void> => {
    setIsTestingPrint(true);
    setError(null);
    try {
      await ensureConnected();
      await printerService.printCalibrationLine();
      await refreshStatus();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Calibration print failed";
      setError(message);
      throw e;
    } finally {
      setIsTestingPrint(false);
    }
  }, [ensureConnected, refreshStatus]);

  const printHelloWorld = useCallback(async (): Promise<void> => {
    setIsTestingPrint(true);
    setError(null);
    try {
      await ensureConnected();
      await printerService.printHelloWorld();
      await refreshStatus();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Hello World print failed";
      setError(message);
      throw e;
    } finally {
      setIsTestingPrint(false);
    }
  }, [ensureConnected, refreshStatus]);

  const printDiagnostic = useCallback(async (): Promise<string> => {
    setIsTestingPrint(true);
    setError(null);
    try {
      await ensureConnected();
      const result = await printerService.printDiagnostic();
      await refreshStatus();
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Diagnostic print failed";
      setError(message);
      throw e;
    } finally {
      setIsTestingPrint(false);
    }
  }, [ensureConnected, refreshStatus]);

  const testPrint = useCallback(async (): Promise<void> => {
    setIsTestingPrint(true);
    setError(null);
    try {
      await ensureConnected();
      await printerService.printTestReceipt();
      await refreshStatus();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Test print failed";
      setError(message);
      throw e;
    } finally {
      setIsTestingPrint(false);
    }
  }, [ensureConnected, refreshStatus]);

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  return {
    connectedDevice:
      connectionStatus === "connected"
        ? { id: INNER_PRINTER_ID, name: "InnerPrinter (Bluetooth)", rssi: null }
        : null,
    deviceType: "SUNMI" as const,
    connectionStatus,
    connectionStatusLabel,
    connectionStatusColor,
    printerStatus,
    isInitializing,
    isReconnecting: isInitializing,
    isTestingPrint,
    error,
    ensureConnected,
    printReceipt,
    testPrint,
    printHelloWorld,
    printDiagnostic,
    printCalibration,
    initPrinter,
    refreshStatus,
    dismissError,
  };
}

const INNER_PRINTER_ID = "00:11:22:33:44:55";
