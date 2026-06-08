import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { printerService, type DeviceType } from "../src/services/PrinterService";
import { hasNativePrinterModule, waitForPrinterConnection } from "../src/services/printerNativeModule";
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

    if (!hasNativePrinterModule()) {
      setError("Printer module missing — rebuild and install the APK on this device.");
      setConnectionStatus("disconnected");
      return false;
    }

    setIsInitializing(true);
    setConnectionStatus("connecting");
    setError(null);

    try {
      const type = await printerService.init();
      setDeviceType(type);

      const connected = await waitForPrinterConnection(8);
      const status = await refreshStatus();

      if (connected && (status === "Normal" || status === "Preparing")) {
        setConnectionStatus("connected");
        return true;
      }

      if (status.startsWith("Error")) {
        setConnectionStatus("disconnected");
        setError(`Printer status: ${status}`);
        return false;
      }

      setConnectionStatus("disconnected");
      setError("Sunmi printer service not connected");
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
    const connected = await waitForPrinterConnection(8);
    if (connected) {
      setConnectionStatus("connected");
      await refreshStatus();
      return true;
    }
    return initPrinter();
  }, [initPrinter, refreshStatus]);

  const printReceipt = useCallback(
    async (data: ReceiptData): Promise<void> => {
      if (!hasNativePrinterModule()) {
        throw new Error("Printer module missing. Rebuild and install the APK.");
      }

      await ensureConnected().catch(() => false);

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
    printHelloWorld,
    printDiagnostic,
    printCalibration,
    initPrinter,
    refreshStatus,
    dismissError,
  };
};
