import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, NativeModules, PermissionsAndroid, Platform } from "react-native";
import { BleManager, Device, State } from "react-native-ble-plx";
import { getItem, removeItem, setItem, StorageKeys } from "../utils/storage";
import { generateEscPosBuffer, bufferToBase64, ReceiptData } from "../utils/generateReceipt";

export interface DiscoveredPrinter {
  id: string;
  name: string;
  rssi: number | null;
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
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBleSupported] = useState(isBleNativeModuleAvailable);

  const managerRef = useRef<BleManager | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectSubRef = useRef<{ remove: () => void } | null>(null);

  const getManager = useCallback((): BleManager | null => {
    if (!isBleSupported) return null;
    if (!managerRef.current) {
      managerRef.current = createBleManager();
    }
    return managerRef.current;
  }, [isBleSupported]);

  const clearDeviceConnection = useCallback(() => {
    disconnectSubRef.current?.remove();
    disconnectSubRef.current = null;
    deviceRef.current = null;
    setConnectedDevice(null);
  }, []);

  const attachDevice = useCallback(
    (device: Device, fallbackName?: string) => {
      disconnectSubRef.current?.remove();
      deviceRef.current = device;
      setConnectedDevice({
        id: device.id,
        name: device.name ?? device.localName ?? fallbackName ?? "Bluetooth Printer",
        rssi: device.rssi,
      });
      disconnectSubRef.current = device.onDisconnected(() => {
        clearDeviceConnection();
      });
    },
    [clearDeviceConnection]
  );

  const autoReconnect = useCallback(async (): Promise<boolean> => {
    const manager = getManager();
    if (!manager) {
      setError(BLE_UNAVAILABLE_MESSAGE);
      return false;
    }

    if (deviceRef.current) {
      try {
        const connected = await deviceRef.current.isConnected();
        if (connected) return true;
      } catch {
        clearDeviceConnection();
      }
    }

    const lastId = await getItem<string>(StorageKeys.LAST_PRINTER_ID);
    if (!lastId) return false;

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
      attachDevice(device, lastName ?? undefined);

      await setItem(StorageKeys.LAST_PRINTER_ID, device.id);
      await setItem(
        StorageKeys.LAST_PRINTER_NAME,
        device.name ?? device.localName ?? lastName ?? "Bluetooth Printer"
      );

      return true;
    } catch {
      clearDeviceConnection();
      return false;
    } finally {
      setIsReconnecting(false);
    }
  }, [attachDevice, clearDeviceConnection, getManager]);

  useEffect(() => {
    if (!isBleSupported) {
      setError(BLE_UNAVAILABLE_MESSAGE);
      return;
    }

    const manager = getManager();
    if (!manager) return;

    const stateSubscription = manager.onStateChange((state) => {
      const enabled = state === State.PoweredOn;
      setBluetoothEnabled(enabled);
      if (enabled && !deviceRef.current) {
        autoReconnect();
      }
    }, true);

    autoReconnect();

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && !deviceRef.current) {
        autoReconnect();
      }
    });

    return () => {
      stateSubscription.remove();
      appStateSubscription.remove();
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      disconnectSubRef.current?.remove();
    };
  }, [autoReconnect, getManager, isBleSupported]);

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
          clearDeviceConnection();
        }

        const permitted = await requestBluetoothPermissions();
        if (!permitted) {
          throw new Error("Bluetooth permissions are required.");
        }

        const device = await manager.connectToDevice(printer.id, { timeout: 15000 });
        await device.discoverAllServicesAndCharacteristics();
        attachDevice(device, printer.name);

        await setItem(StorageKeys.LAST_PRINTER_ID, printer.id);
        await setItem(StorageKeys.LAST_PRINTER_NAME, printer.name);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to connect to Bluetooth printer";
        setError(message);
        clearDeviceConnection();
      } finally {
        setIsConnecting(false);
      }
    },
    [attachDevice, clearDeviceConnection, getManager]
  );

  const disconnect = useCallback(async () => {
    try {
      if (deviceRef.current) {
        await deviceRef.current.cancelConnection();
      }
    } catch {
      // ignore
    }
    clearDeviceConnection();
    await removeItem(StorageKeys.LAST_PRINTER_ID);
    await removeItem(StorageKeys.LAST_PRINTER_NAME);
  }, [clearDeviceConnection]);

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

  const ensureConnected = useCallback(async (): Promise<boolean> => {
    if (!getManager()) {
      setError(BLE_UNAVAILABLE_MESSAGE);
      return false;
    }

    if (deviceRef.current) {
      try {
        const connected = await deviceRef.current.isConnected();
        if (connected) return true;
      } catch {
        clearDeviceConnection();
      }
    }
    return autoReconnect();
  }, [autoReconnect, clearDeviceConnection, getManager]);

  const printReceipt = useCallback(
    async (data: ReceiptData): Promise<void> => {
      const connected = await ensureConnected();
      if (!connected || !deviceRef.current) {
        throw new Error("No Bluetooth printer connected");
      }

      const buffer = generateEscPosBuffer(data);
      await writeChunked(deviceRef.current, buffer);
    },
    [ensureConnected, writeChunked]
  );

  return {
    isScanning,
    devices,
    connectedDevice,
    isConnecting,
    isReconnecting,
    isBleSupported,
    bluetoothEnabled,
    error,
    scanForPrinters,
    connectToPrinter,
    disconnect,
    ensureConnected,
    printReceipt,
    autoReconnect,
  };
}
