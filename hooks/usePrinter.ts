import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, Device, State } from "react-native-ble-plx";
import { getItem, setItem, StorageKeys } from "../utils/storage";
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

let bleManagerInstance: BleManager | null = null;

function getBleManager(): BleManager {
  if (!bleManagerInstance) {
    bleManagerInstance = new BleManager();
  }
  return bleManagerInstance;
}

async function requestAndroidPermissions(): Promise<boolean> {
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

function isLikelyPrinter(name: string | null): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  const keywords = [
    "printer",
    "pos",
    "thermal",
    "58",
    "80",
    "rp",
    "mtp",
    "inner",
    "speedx",
    "goojprt",
    "epson",
    "star",
    "bt-",
    "bluetooth printer",
  ];
  return keywords.some((k) => lower.includes(k));
}

export function usePrinter() {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<DiscoveredPrinter[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<DiscoveredPrinter | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const managerRef = useRef<BleManager>(getBleManager());
  const deviceRef = useRef<Device | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const manager = managerRef.current;
    const subscription = manager.onStateChange((state) => {
      setBluetoothEnabled(state === State.PoweredOn);
    }, true);

    return () => {
      subscription.remove();
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    };
  }, []);

  const autoReconnect = useCallback(async () => {
    const lastId = await getItem<string>(StorageKeys.LAST_PRINTER_ID);
    if (!lastId) return;

    try {
      const manager = managerRef.current;
      const state = await manager.state();
      if (state !== State.PoweredOn) return;

      const device = await manager.connectToDevice(lastId, { autoConnect: false });
      await device.discoverAllServicesAndCharacteristics();
      deviceRef.current = device;
      setConnectedDevice({
        id: device.id,
        name: device.name ?? device.localName ?? "Printer",
        rssi: device.rssi,
      });
    } catch {
      // auto-reconnect is best-effort
    }
  }, []);

  useEffect(() => {
    autoReconnect();
  }, [autoReconnect]);

  const scanForPrinters = useCallback(async () => {
    setError(null);
    const permitted = await requestAndroidPermissions();
    if (!permitted) {
      setError("Bluetooth permissions are required to scan for printers.");
      return;
    }

    const manager = managerRef.current;
    const state = await manager.state();
    if (state !== State.PoweredOn) {
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
      if (!name && !isLikelyPrinter(name)) return;

      found.set(device.id, {
        id: device.id,
        name: name || `Device ${device.id.slice(0, 8)}`,
        rssi: device.rssi,
      });
      setDevices(Array.from(found.values()).sort((a, b) => (b.rssi ?? -100) - (a.rssi ?? -100)));
    });

    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
    }, 10000);
  }, []);

  const connectToPrinter = useCallback(async (printer: DiscoveredPrinter) => {
    setIsConnecting(true);
    setError(null);

    try {
      const manager = managerRef.current;
      manager.stopDeviceScan();
      setIsScanning(false);

      if (deviceRef.current) {
        try {
          await deviceRef.current.cancelConnection();
        } catch {
          // ignore
        }
      }

      const device = await manager.connectToDevice(printer.id, { timeout: 15000 });
      await device.discoverAllServicesAndCharacteristics();
      deviceRef.current = device;
      setConnectedDevice(printer);
      await setItem(StorageKeys.LAST_PRINTER_ID, printer.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to connect to printer";
      setError(message);
      setConnectedDevice(null);
      deviceRef.current = null;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      if (deviceRef.current) {
        await deviceRef.current.cancelConnection();
      }
    } catch {
      // ignore
    }
    deviceRef.current = null;
    setConnectedDevice(null);
  }, []);

  const findWritableCharacteristic = useCallback(async (device: Device) => {
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
      }
    },
    [findWritableCharacteristic]
  );

  const printReceipt = useCallback(
    async (data: ReceiptData): Promise<void> => {
      if (!deviceRef.current) {
        throw new Error("No printer connected");
      }

      const buffer = generateEscPosBuffer(data);
      await writeChunked(deviceRef.current, buffer);
    },
    [writeChunked]
  );

  return {
    isScanning,
    devices,
    connectedDevice,
    isConnecting,
    bluetoothEnabled,
    error,
    scanForPrinters,
    connectToPrinter,
    disconnect,
    printReceipt,
    autoReconnect,
  };
}
