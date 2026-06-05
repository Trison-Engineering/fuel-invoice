import { Linking, Platform } from "react-native";
import { NativeModules } from "react-native";
import { logPrinterAttempt } from "./printerLog";

export async function openBluetoothSettings(): Promise<boolean> {
  if (Platform.OS !== "android") return false;

  try {
    const module = NativeModules.PosClassicBtPrinter as
      | { openBluetoothSettings?: () => Promise<boolean> }
      | undefined;

    if (module?.openBluetoothSettings) {
      await module.openBluetoothSettings();
      logPrinterAttempt("Opened Bluetooth settings via native module");
      return true;
    }
  } catch (e) {
    logPrinterAttempt("Native BT settings intent failed", e);
  }

  try {
    await Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS");
    logPrinterAttempt("Opened Bluetooth settings via Linking.sendIntent");
    return true;
  } catch (e) {
    logPrinterAttempt("Linking.sendIntent failed, trying openSettings", e);
    try {
      await Linking.openSettings();
      return true;
    } catch {
      return false;
    }
  }
}
