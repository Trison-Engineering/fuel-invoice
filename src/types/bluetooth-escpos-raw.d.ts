import "@vardrz/react-native-bluetooth-escpos-printer";

declare module "@vardrz/react-native-bluetooth-escpos-printer" {
  interface PrintOptions {
    feed?: number;
    autoCut?: boolean;
  }

  interface BluetoothEscposPrinterType {
    /** Patched via plugins/withBluetoothRawPrinter.js — writes bytes directly to SPP. */
    sendRAWData(base64: string): Promise<void>;
    printDualPic(
      base64Left: string,
      base64Right: string,
      options?: { width?: number; feed?: number; paperSize?: number }
    ): Promise<void>;
  }
}
