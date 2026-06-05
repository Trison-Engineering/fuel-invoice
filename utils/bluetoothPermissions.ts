import { PermissionsAndroid, Platform } from "react-native";
import { logPrinterAttempt } from "./printerLog";

export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;

  const apiLevel = Platform.Version;

  if (typeof apiLevel === "number" && apiLevel >= 31) {
    const permissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ];

    logPrinterAttempt("Requesting runtime Bluetooth permissions", permissions);
    const results = await PermissionsAndroid.requestMultiple(permissions);
    const granted = Object.values(results).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED
    );
    logPrinterAttempt("Permission results", results);
    return granted;
  }

  logPrinterAttempt("Requesting ACCESS_FINE_LOCATION (Android < 12)");
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
