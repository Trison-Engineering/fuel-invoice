import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, NativeModules, PermissionsAndroid, Platform } from "react-native";
import { BleManager, Device, State } from "react-native-ble-plx";
import { getItem, removeItem, setItem, StorageKeys } from "../utils/storage";
import { generateEscPosBuffer, bufferToBase64, ReceiptData } from "../utils/generateReceipt";
import {
  checkBuiltInPrinterStatus,
  connectBuiltInPrinter,
  generateTestReceiptBuffer,
  getActiveInternalBackend,
  getBuiltInPrinterId,
  getBuiltInPrinterInfo,
  getBuiltInPrinterName,
  isBuiltInPrinterReady,
  isInternalPrinterModuleAvailable,
  printBuiltInRaw,
} from "../utils/builtInPrinter";
import {
  checkSerialPrinterStatus,
  connectSerialPrinter,
  disconnectSerialPrinter,
  getConnectedSerialPath,
  getSerialPrinterId,
  getSerialPrinterName,
  isSerialPrinterModuleAvailable,
  isSerialPrinterReady,
  printSerialRaw,
} from "../utils/serialPrinter";

export interface DiscoveredPrinter {
  id: string;
  name: string;
  rssi: number | null;
}

export type PrinterMode = "builtin" | "serial" | "bluetooth" | "none";

export type PrinterConnectionMethod = "aidl" | "serial" | "bluetooth";

export interface PrinterTestResult {
  method: PrinterConnectionMethod;
  label: string;
  success: boolean;
  message: string;
}

const PRINTER_SERVICE_UUIDS = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

const WRITE_CHAR_UUID = "49535343-8841-43f4-a8d4-ecbe34729bb3";
const CHUNK_SIZE = 180;
const CHUNK_DELAY_MS = 25;

const BLE_UNAVAILABLE_MESSAGE =
  "Bluetooth printing needs the installed app build. Expo Go does not support BLE printers.";

let bleManagerInstance: BleManager | null = null;

export function isBleNativeModuleAvailable(): boolean {
  return NativeModules.BlePlx != null;
}

function createBleManager(): BleManager | null {
  if (!isBleNativeModuleAvailable()) {
    return null;
  }
  if (!bleManagerInstance) {
    bleManagerInstance = new BleManager();
  }
  return bleManagerInstance;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;

  const apiLevel = Platform.Version;
  if (typeof apiLevel === "number" && apiLevel >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (
      results["android.permission.BLUETOOTH_SCAN"] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      results["android.permission.BLUETOOTH_CONNECT"] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

async function waitForBluetoothPoweredOn(manager: BleManager): Promise<boolean> {
  const state = await manager.state();
  if (state === State.PoweredOn) return true;

  return new Promise((resolve) => {
    const subscription = manager.onStateChange((nextState) => {
      if (nextState === State.PoweredOn) {
        subscription.remove();
        resolve(true);
      } else if (nextState === State.PoweredOff || nextState === State.Unauthorized) {
        subscription.remove();
        resolve(false);
      }
    }, true);

    setTimeout(() => {
      subscription.remove();
      resolve(false);
    }, 8000);
  });
}

export function usePrinter() {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<DiscoveredPrinter[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<DiscoveredPrinter | null>(null);
  const [printerMode, setPrinterMode] = useState<PrinterMode>("none");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isTestingPrint, setIsTestingPrint] = useState(false);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<PrinterTestResult[]>([]);
  const [isBleSupported] = useState(isBleNativeModuleAvailable);
  const [isBuiltInSupported] = useState(isInternalPrinterModuleAvailable);
  const [isSerialSupported] = useState(isSerialPrinterModuleAvailable);

  const managerRef = useRef<BleManager | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectSubRef = useRef<{ remove: () => void } | null>(null);
  const printerModeRef = useRef<PrinterMode>("none");

  const getManager = useCallback((): BleManager | null => {
    if (!isBleSupported) return null;
    if (!managerRef.current) {
      managerRef.current = createBleManager();
    }
    return managerRef.current;
  }, [isBleSupported]);

  const setMode = useCallback((mode: PrinterMode) => {
    printerModeRef.current = mode;
    setPrinterMode(mode);
  }, []);

  const clearBluetoothConnection = useCallback(() => {
    disconnectSubRef.current?.remove();
    disconnectSubRef.current = null;
    deviceRef.current = null;
    if (printerModeRef.current === "bluetooth") {
      setConnectedDevice(null);
      setMode("none");
    }
  }, [setMode]);

  const attachBluetoothDevice = useCallback(
    (device: Device, fallbackName?: string) => {
      disconnectSubRef.current?.remove();
      deviceRef.current = device;
      setMode("bluetooth");
      setConnectedDevice({
        id: device.id,
        name: device.name ?? device.localName ?? fallbackName ?? "Bluetooth Printer",
        rssi: device.rssi,
      });
      disconnectSubRef.current = device.onDisconnected(() => {
        clearBluetoothConnection();
      });
    },
    [clearBluetoothConnection, setMode]
  );

  const connectBuiltIn = useCallback(async (): Promise<boolean> => {
    if (!isBuiltInSupported) return false;

    setIsReconnecting(true);
    setError(null);

    try {
      const ready = await connectBuiltInPrinter();
      if (!ready) return false;

      const info = await getBuiltInPrinterInfo();
      const backend = getActiveInternalBackend();
      const backendLabel = backend === "printerModule" ? "AIDL" : "Sunmi AIDL";
      const displayName = info.model
        ? `${getBuiltInPrinterName()} (${info.model}, ${backendLabel})`
        : `${getBuiltInPrinterName()} (${backendLabel})`;

      setMode("builtin");
      setConnectedDevice({
        id: getBuiltInPrinterId(),
        name: displayName,
        rssi: null,
      });
      await setItem(StorageKeys.PRINTER_MODE, "builtin");
      return true;
    } catch {
      return false;
    } finally {
      setIsReconnecting(false);
    }
  }, [isBuiltInSupported, setMode]);

  const connectSerial = useCallback(async (): Promise<boolean> => {
    if (!isSerialSupported) return false;

    setIsReconnecting(true);
    setError(null);

    try {
      const savedPath = await getItem<string>(StorageKeys.LAST_SERIAL_PATH);
      const ready = await connectSerialPrinter(savedPath ?? undefined);
      if (!ready) return false;

      const path = getConnectedSerialPath();
      setMode("serial");
      setConnectedDevice({
        id: getSerialPrinterId(),
        name: getSerialPrinterName(path ?? undefined),
        rssi: null,
      });
      await setItem(StorageKeys.PRINTER_MODE, "serial");
      if (path) {
        await setItem(StorageKeys.LAST_SERIAL_PATH, path);
      }
      return true;
    } catch {
      return false;
    } finally {
      setIsReconnecting(false);
    }
  }, [isSerialSupported, setMode]);

  const reconnectBluetooth = useCallback(async (): Promise<boolean> => {
    const manager = getManager();
    if (!manager) return false;

    if (deviceRef.current) {
      try {
        const connected = await deviceRef.current.isConnected();
        if (connected) return true;
      } catch {
        clearBluetoothConnection();
      }
    }

    const lastId = await getItem<string>(StorageKeys.LAST_PRINTER_ID);
    if (!lastId || lastId === getBuiltInPrinterId() || lastId === getSerialPrinterId()) {
      return false;
    }

    const lastName = await getItem<string>(StorageKeys.LAST_PRINTER_NAME);

    setIsReconnecting(true);
    setError(null);

    try {
      const permitted = await requestBluetoothPermissions();
      if (!permitted) {
        setError("Bluetooth permissions are required.");
        return false;
      }

      const poweredOn = await waitForBluetoothPoweredOn(manager);
      if (!poweredOn) {
        setBluetoothEnabled(false);
        setError("Please turn on Bluetooth.");
        return false;
      }

      setBluetoothEnabled(true);

      const device = await manager.connectToDevice(lastId, {
        timeout: 15000,
        autoConnect: Platform.OS === "android",
      });
      await device.discoverAllServicesAndCharacteristics();
      attachBluetoothDevice(device, lastName ?? undefined);

      await setItem(StorageKeys.PRINTER_MODE, "bluetooth");
      await setItem(StorageKeys.LAST_PRINTER_ID, device.id);
      await setItem(
        StorageKeys.LAST_PRINTER_NAME,
        device.name ?? device.localName ?? lastName ?? "Bluetooth Printer"
      );

      return true;
    } catch {
      clearBluetoothConnection();
      return false;
    } finally {
      setIsReconnecting(false);
    }
  }, [attachBluetoothDevice, clearBluetoothConnection, getManager]);

  const connectWithFallback = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "android" && isBuiltInSupported) {
      const builtInConnected = await connectBuiltIn();
      if (builtInConnected) return true;
    }

    if (Platform.OS === "android" && isSerialSupported) {
      const serialConnected = await connectSerial();
      if (serialConnected) return true;
    }

    const savedMode = await getItem<PrinterMode>(StorageKeys.PRINTER_MODE);
    if (savedMode === "bluetooth") {
      return reconnectBluetooth();
    }

    return false;
  }, [connectBuiltIn, connectSerial, isBuiltInSupported, isSerialSupported, reconnectBluetooth]);

  const autoReconnect = useCallback(async (): Promise<boolean> => {
    if (printerModeRef.current === "builtin" && (await isBuiltInPrinterReady())) {
      return true;
    }
    if (printerModeRef.current === "serial" && (await isSerialPrinterReady())) {
      return true;
    }

    return connectWithFallback();
  }, [connectWithFallback]);

  useEffect(() => {
    autoReconnect();

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        autoReconnect();
      }
    });

    let stateSubscription: { remove: () => void } | undefined;
    const manager = getManager();
    if (manager) {
      stateSubscription = manager.onStateChange((state) => {
        const enabled = state === State.PoweredOn;
        setBluetoothEnabled(enabled);
        if (enabled && printerModeRef.current === "bluetooth" && !deviceRef.current) {
          reconnectBluetooth();
        }
      }, true);
    } else if (!isBuiltInSupported && !isSerialSupported) {
      setError(BLE_UNAVAILABLE_MESSAGE);
    }

    return () => {
      stateSubscription?.remove();
      appStateSubscription.remove();
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      disconnectSubRef.current?.remove();
    };
  }, [autoReconnect, getManager, isBuiltInSupported, isSerialSupported, reconnectBluetooth]);

  const scanForPrinters = useCallback(async () => {
    const manager = getManager();
    if (!manager) {
      setError(BLE_UNAVAILABLE_MESSAGE);
      return;
    }

    setError(null);
    const permitted = await requestBluetoothPermissions();
    if (!permitted) {
      setError("Bluetooth permissions are required to scan for printers.");
      return;
    }

    const poweredOn = await waitForBluetoothPoweredOn(manager);
    if (!poweredOn) {
      setError("Please enable Bluetooth to scan for printers.");
      setBluetoothEnabled(false);
      return;
    }

    setIsScanning(true);
    setDevices([]);

    const found = new Map<string, DiscoveredPrinter>();

    manager.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
      if (err || !device) return;

      const name = device.name ?? device.localName ?? "";
      found.set(device.id, {
        id: device.id,
        name: name || `Bluetooth device ${device.id.slice(0, 8)}`,
        rssi: device.rssi,
      });
      setDevices(Array.from(found.values()).sort((a, b) => (b.rssi ?? -100) - (a.rssi ?? -100)));
    });

    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
    }, 10000);
  }, [getManager]);

  const connectToPrinter = useCallback(
    async (printer: DiscoveredPrinter) => {
      const manager = getManager();
      if (!manager) {
        setError(BLE_UNAVAILABLE_MESSAGE);
        return;
      }

      setIsConnecting(true);
      setError(null);

      try {
        manager.stopDeviceScan();
        setIsScanning(false);

        if (deviceRef.current) {
          try {
            await deviceRef.current.cancelConnection();
          } catch {
            // ignore
          }
          clearBluetoothConnection();
        }

        const permitted = await requestBluetoothPermissions();
        if (!permitted) {
          throw new Error("Bluetooth permissions are required.");
        }

        const device = await manager.connectToDevice(printer.id, { timeout: 15000 });
        await device.discoverAllServicesAndCharacteristics();
        attachBluetoothDevice(device, printer.name);

        await setItem(StorageKeys.PRINTER_MODE, "bluetooth");
        await setItem(StorageKeys.LAST_PRINTER_ID, printer.id);
        await setItem(StorageKeys.LAST_PRINTER_NAME, printer.name);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to connect to Bluetooth printer";
        setError(message);
        clearBluetoothConnection();
      } finally {
        setIsConnecting(false);
      }
    },
    [attachBluetoothDevice, clearBluetoothConnection, getManager]
  );

  const disconnect = useCallback(async () => {
    if (printerModeRef.current === "bluetooth" && deviceRef.current) {
      try {
        await deviceRef.current.cancelConnection();
      } catch {
        // ignore
      }
      clearBluetoothConnection();
      await removeItem(StorageKeys.LAST_PRINTER_ID);
      await removeItem(StorageKeys.LAST_PRINTER_NAME);
      await setItem(StorageKeys.PRINTER_MODE, "none");
      return;
    }

    if (printerModeRef.current === "serial") {
      await disconnectSerialPrinter();
      setConnectedDevice(null);
      setMode("none");
      await setItem(StorageKeys.PRINTER_MODE, "none");
      return;
    }

    if (printerModeRef.current === "builtin") {
      setConnectedDevice(null);
      setMode("none");
      await setItem(StorageKeys.PRINTER_MODE, "none");
    }
  }, [clearBluetoothConnection, setMode]);

  const findWritableCharacteristic = useCallback(async (device: Device) => {
    for (const serviceUuid of PRINTER_SERVICE_UUIDS) {
      try {
        const characteristics = await device.characteristicsForService(serviceUuid);
        for (const char of characteristics) {
          if (char.isWritableWithResponse || char.isWritableWithoutResponse) {
            return { serviceUuid, charUuid: char.uuid };
          }
        }
      } catch {
        // try next service
      }
    }

    const services = await device.services();
    for (const service of services) {
      const characteristics = await service.characteristics();
      for (const char of characteristics) {
        if (char.isWritableWithResponse || char.isWritableWithoutResponse) {
          return { serviceUuid: service.uuid, charUuid: char.uuid };
        }
      }
    }

    return { serviceUuid: PRINTER_SERVICE_UUIDS[1], charUuid: WRITE_CHAR_UUID };
  }, []);

  const writeChunked = useCallback(
    async (device: Device, data: Uint8Array) => {
      const { serviceUuid, charUuid } = await findWritableCharacteristic(device);

      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const slice = data.slice(i, i + CHUNK_SIZE);
        const base64 = bufferToBase64(slice);
        try {
          await device.writeCharacteristicWithoutResponseForService(
            serviceUuid,
            charUuid,
            base64
          );
        } catch {
          await device.writeCharacteristicWithResponseForService(
            serviceUuid,
            charUuid,
            base64
          );
        }
        if (i + CHUNK_SIZE < data.length) {
          await delay(CHUNK_DELAY_MS);
        }
      }
    },
    [findWritableCharacteristic]
  );

  const checkPrinterStatus = useCallback(async (): Promise<void> => {
    if (printerModeRef.current === "builtin" || (await isBuiltInPrinterReady())) {
      const status = await checkBuiltInPrinterStatus();
      if (!status.ready) {
        throw new Error(status.message);
      }
      return;
    }

    if (printerModeRef.current === "serial" || (await isSerialPrinterReady())) {
      const status = await checkSerialPrinterStatus();
      if (!status.ready) {
        throw new Error(status.message);
      }
      return;
    }

    if (printerModeRef.current === "bluetooth" && deviceRef.current) {
      try {
        const connected = await deviceRef.current.isConnected();
        if (!connected) {
          throw new Error("Bluetooth printer disconnected");
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Bluetooth printer unavailable";
        throw new Error(message);
      }
    }
  }, []);

  const ensureConnected = useCallback(async (): Promise<boolean> => {
    if (printerModeRef.current === "builtin" && (await isBuiltInPrinterReady())) {
      return true;
    }
    if (printerModeRef.current === "serial" && (await isSerialPrinterReady())) {
      return true;
    }

    if (Platform.OS === "android" && isBuiltInSupported) {
      const builtIn = await connectBuiltIn();
      if (builtIn) return true;
    }

    if (Platform.OS === "android" && isSerialSupported) {
      const serial = await connectSerial();
      if (serial) return true;
    }

    if (printerModeRef.current === "bluetooth" && deviceRef.current) {
      try {
        const connected = await deviceRef.current.isConnected();
        if (connected) return true;
      } catch {
        clearBluetoothConnection();
      }
    }

    return reconnectBluetooth();
  }, [
    clearBluetoothConnection,
    connectBuiltIn,
    connectSerial,
    isBuiltInSupported,
    isSerialSupported,
    reconnectBluetooth,
  ]);

  const printRawBuffer = useCallback(
    async (buffer: Uint8Array): Promise<void> => {
      await checkPrinterStatus();

      if (printerModeRef.current === "builtin" || (await isBuiltInPrinterReady())) {
        await printBuiltInRaw(buffer);
        return;
      }

      if (printerModeRef.current === "serial" || (await isSerialPrinterReady())) {
        await printSerialRaw(buffer);
        return;
      }

      if (!deviceRef.current) {
        throw new Error("No Bluetooth printer connected");
      }

      const utf8Buffer = new Uint8Array([0x1b, 0x40, 0x1c, 0x26, ...buffer]);
      await writeChunked(deviceRef.current, utf8Buffer);
    },
    [checkPrinterStatus, writeChunked]
  );

  const printReceipt = useCallback(
    async (data: ReceiptData): Promise<void> => {
      const connected = await ensureConnected();
      if (!connected) {
        throw new Error("No printer connected");
      }

      const buffer = generateEscPosBuffer(data);
      await printRawBuffer(buffer);
    },
    [ensureConnected, printRawBuffer]
  );

  const testPrint = useCallback(async (): Promise<PrinterTestResult[]> => {
    setIsTestingPrint(true);
    setError(null);
    setTestResults([]);

    const results: PrinterTestResult[] = [];
    const testBuffer = generateTestReceiptBuffer();
    let workingMethod: PrinterConnectionMethod | null = null;

    const tryAidl = async (): Promise<PrinterTestResult> => {
      const label =
        getActiveInternalBackend() === "printerModule"
          ? "Internal AIDL (PrinterModule)"
          : "Internal AIDL (Sunmi service)";
      try {
        if (!isBuiltInSupported) {
          return {
            method: "aidl",
            label,
            success: false,
            message: "AIDL module not available in this build",
          };
        }
        const connected = await connectBuiltInPrinter();
        if (!connected) {
          return { method: "aidl", label, success: false, message: "Could not bind printer service" };
        }
        const status = await checkBuiltInPrinterStatus();
        if (!status.ready) {
          return { method: "aidl", label, success: false, message: status.message };
        }
        await printBuiltInRaw(testBuffer);
        setMode("builtin");
        const info = await getBuiltInPrinterInfo();
        setConnectedDevice({
          id: getBuiltInPrinterId(),
          name: info.model
            ? `${getBuiltInPrinterName()} (${info.model})`
            : getBuiltInPrinterName(),
          rssi: null,
        });
        await setItem(StorageKeys.PRINTER_MODE, "builtin");
        workingMethod = "aidl";
        return { method: "aidl", label, success: true, message: "Test receipt sent via AIDL" };
      } catch (e) {
        const message = e instanceof Error ? e.message : "AIDL print failed";
        return { method: "aidl", label, success: false, message };
      }
    };

    const trySerial = async (): Promise<PrinterTestResult> => {
      const label = "USB Serial (/dev/ttyS1, /dev/ttyS2)";
      try {
        if (!isSerialSupported) {
          return {
            method: "serial",
            label,
            success: false,
            message: "Serial module not available — run expo prebuild and rebuild",
          };
        }
        const connected = await connectSerialPrinter();
        if (!connected) {
          return {
            method: "serial",
            label,
            success: false,
            message: "Could not open /dev/ttyS1 or /dev/ttyS2",
          };
        }
        const status = await checkSerialPrinterStatus();
        if (!status.ready) {
          return { method: "serial", label, success: false, message: status.message };
        }
        await printSerialRaw(testBuffer);
        const path = getConnectedSerialPath();
        setMode("serial");
        setConnectedDevice({
          id: getSerialPrinterId(),
          name: getSerialPrinterName(path ?? undefined),
          rssi: null,
        });
        await setItem(StorageKeys.PRINTER_MODE, "serial");
        if (path) {
          await setItem(StorageKeys.LAST_SERIAL_PATH, path);
        }
        workingMethod = "serial";
        return {
          method: "serial",
          label,
          success: true,
          message: path ? `Test receipt sent via ${path}` : "Test receipt sent via serial",
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Serial print failed";
        return { method: "serial", label, success: false, message };
      }
    };

    const tryBluetooth = async (): Promise<PrinterTestResult> => {
      const label = "Bluetooth (last paired device)";
      try {
        const manager = getManager();
        if (!manager) {
          return { method: "bluetooth", label, success: false, message: BLE_UNAVAILABLE_MESSAGE };
        }

        const lastId = await getItem<string>(StorageKeys.LAST_PRINTER_ID);
        if (!lastId || lastId === getBuiltInPrinterId() || lastId === getSerialPrinterId()) {
          return {
            method: "bluetooth",
            label,
            success: false,
            message: "No saved Bluetooth printer — scan and connect first",
          };
        }

        const reconnected = await reconnectBluetooth();
        if (!reconnected || !deviceRef.current) {
          return {
            method: "bluetooth",
            label,
            success: false,
            message: "Could not connect to saved Bluetooth printer",
          };
        }

        const utf8Buffer = new Uint8Array([0x1b, 0x40, 0x1c, 0x26, ...testBuffer]);
        await writeChunked(deviceRef.current, utf8Buffer);
        workingMethod = "bluetooth";
        return {
          method: "bluetooth",
          label,
          success: true,
          message: "Test receipt sent via Bluetooth",
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Bluetooth print failed";
        return { method: "bluetooth", label, success: false, message };
      }
    };

    results.push(await tryAidl());
    if (!workingMethod) {
      results.push(await trySerial());
    }
    if (!workingMethod) {
      results.push(await tryBluetooth());
    }

    setTestResults(results);

    if (workingMethod) {
      const winner = results.find((r) => r.success);
      if (winner) {
        setError(null);
      }
    } else {
      setError("All printer connection methods failed. See test results below.");
    }

    setIsTestingPrint(false);
    return results;
  }, [getManager, isBuiltInSupported, isSerialSupported, reconnectBluetooth, setMode, writeChunked]);

  return {
    isScanning,
    devices,
    connectedDevice,
    printerMode,
    isConnecting,
    isReconnecting,
    isTestingPrint,
    testResults,
    isBleSupported,
    isBuiltInSupported,
    isSerialSupported,
    bluetoothEnabled,
    error,
    scanForPrinters,
    connectToPrinter,
    connectBuiltIn,
    connectSerial,
    disconnect,
    ensureConnected,
    printReceipt,
    testPrint,
    autoReconnect,
  };
};
