import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { printerService, type DeviceType } from "../src/services/PrinterService";
import type { ReceiptData } from "../utils/generateReceipt";

export type PrinterConnectionStatus = "connected" | "disconnected" | "connecting";

const DEVICE_LABELS: Record<DeviceType, string> = {
  SUNMI: "Sunmi V2s_GL (built-in printer)",
  NYX: "EzPump Handheld-POS (NYX service)",
  UNKNOWN: "Built-in printer",
};

export function usePrinter() {
  const [connectionStatus, setConnectionStatus] = useState<PrinterConnectionStatus>("disconnected");
  const [printerStatus, setPrinterStatus] = useState<string>("Checking...");
  const [deviceType, setDeviceType] = useState<DeviceType>("UNKNOWN");
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
    const status = await printerService.getPrinterStatus();
    setPrinterStatus(status);
    return status;
  }, []);

  const initPrinter = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") {
      setError("Built-in printer requires an Android POS build.");
      setConnectionStatus("disconnected");
      return false;
    }

    setIsInitializing(true);
    setConnectionStatus("connecting");
    setError(null);

    try {
      const type = await printerService.init();
      setDeviceType(type);
      const status = await refreshStatus();
      if (status.startsWith("Error")) {
        setConnectionStatus("disconnected");
        setError(`Printer status: ${status}`);
        return false;
      }
      setConnectionStatus("connected");
      return true;
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

      await printerService.printFuelReceipt(data);
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

  const printDiagnostic = useCallback(async (): Promise<string> => {
    setIsTestingPrint(true);
    setError(null);

    try {
      const connected = await ensureConnected();
      if (!connected) {
        throw new Error("Printer not ready");
      }
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
      const connected = await ensureConnected();
      if (!connected) {
        throw new Error("Printer not ready");
      }
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

  const connectedDeviceName = DEVICE_LABELS[deviceType];

  return {
    connectedDevice:
      connectionStatus === "connected"
        ? { id: `${deviceType.toLowerCase()}-builtin`, name: connectedDeviceName, rssi: null }
        : null,
    deviceType,
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
    printDiagnostic,
    printCalibration,
    initPrinter,
    refreshStatus,
    dismissError,
  };
};
