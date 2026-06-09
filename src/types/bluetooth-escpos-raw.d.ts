import "@vardrz/react-native-bluetooth-escpos-printer";

declare module "@vardrz/react-native-bluetooth-escpos-printer" {
  interface BluetoothEscposPrinterType {
    /** Patched via plugins/withBluetoothRawPrinter.js — writes bytes directly to SPP. */
    sendRAWData(base64: string): Promise<void>;
  }
}
