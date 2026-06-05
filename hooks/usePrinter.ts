import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { NyxPrinterService } from "../src/services/NyxPrinterService";
import type { ReceiptData } from "../utils/generateReceipt";

export type PrinterConnectionStatus = "connected" | "disconnected" | "connecting";

const NYX_DEVICE_NAME = "Built-in printer (NYX service)";

export function usePrinter() {
  const [connectionStatus, setConnectionStatus] = useState<PrinterConnectionStatus>("disconnected");
  const [printerStatus, setPrinterStatus] = useState<string>("Checking...");
  const [isInitializing, setIsInitializing] = useState(false);
  const [isTestingPrint, setIsTestingPrint] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectionStatusLabel =
    connectionStatus === "connected"
      ? "Printer Connected"
      : connectionStatus === "connecting"
        ? "Connecting..."
        : "Printer Disconnected";

  const refreshStatus = useCallback(async (): Promise<string> => {
    const status = await NyxPrinterService.getPrinterStatus();
    setPrinterStatus(status);
    return status;
  }, []);

  const initPrinter = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") {
      setError("NYX built-in printer requires an Android POS build.");
      setConnectionStatus("disconnected");
      return false;
    }

    setIsInitializing(true);
    setConnectionStatus("connecting");
    setError(null);

    try {
      await NyxPrinterService.initPrinter();
      const status = await refreshStatus();
      if (status.startsWith("Error")) {
        setConnectionStatus("disconnected");
        setError(`Printer status: ${status}`);
        return false;
      }
      setConnectionStatus("connected");
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to initialize NYX printer";
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
    if (connectionStatus === "connected") {
      return true;
    }
    return initPrinter();
  }, [connectionStatus, initPrinter]);

  const printReceipt = useCallback(
    async (data: ReceiptData): Promise<void> => {
      const connected = await ensureConnected();
      if (!connected) {
        throw new Error("Printer not ready. Open Printer settings to retry.");
      }

      const status = await refreshStatus();
      if (status === "Out of paper") {
        throw new Error("Printer is out of paper");
      }
      if (status.startsWith("Error")) {
        throw new Error(`Printer status: ${status}`);
      }

      await NyxPrinterService.printFuelReceipt(data);
      await refreshStatus();
    },
    [ensureConnected, refreshStatus]
  );

  const printCalibration = useCallback(async (): Promise<void> => {
    setIsTestingPrint(true);
    setError(null);
    try {
      const connected = await ensureConnected();
      if (!connected) throw new Error("Printer not ready");
      await NyxPrinterService.printCalibrationLine();
      await refreshStatus();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Calibration print failed";
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
      const connected = await ensureConnected();
      if (!connected) {
        throw new Error("Printer not ready");
      }
      await NyxPrinterService.printTestReceipt();
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
    connectedDevice: connectionStatus === "connected" ? { id: "nyx-builtin", name: NYX_DEVICE_NAME, rssi: null } : null,
    connectionStatus,
    connectionStatusLabel,
    printerStatus,
    isInitializing,
    isReconnecting: isInitializing,
    isTestingPrint,
    error,
    ensureConnected,
    printReceipt,
    testPrint,
    printCalibration,
    initPrinter,
    refreshStatus,
    dismissError,
  };
};
