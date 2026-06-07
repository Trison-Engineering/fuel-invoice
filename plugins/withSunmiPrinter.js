const { withAndroidManifest } = require("@expo/config-plugins");

const POS_PRINTER_PACKAGES = [
  "com.iposprinter.iposprinterservice",
  "com.iposprinter.iposprinterservice2",
  "com.zkc.printer",
  "com.zkc.helper",
  "com.sunmi.printerhelper",
  "woyou.aidlservice.jiuiv5",
  "woyou.stu.sdkservice",
  "com.sunmi.peripheral.printer",
  "net.nyx.printerservice",
  "com.android.printspooler",
];

const POS_PRINTER_ACTIONS = [
  "com.iposprinter.iposprinterservice.IPosPrinterService",
  "com.iposprinter.iposprinterservice.IPosPrintService",
];

module.exports = function withSunmiPrinter(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest.queries) {
      manifest.queries = [];
    }
    if (!manifest.queries[0]) {
      manifest.queries.push({});
    }

    const queries = manifest.queries[0];
    if (!queries.package) {
      queries.package = [];
    }
    if (!queries.intent) {
      queries.intent = [];
    }

    for (const packageName of POS_PRINTER_PACKAGES) {
      const exists = queries.package.some(
        (entry) => entry.$?.["android:name"] === packageName
      );
      if (!exists) {
        queries.package.push({
          $: { "android:name": packageName },
        });
      }
    }

    for (const action of POS_PRINTER_ACTIONS) {
      const exists = queries.intent.some((entry) =>
        entry.action?.some((a) => a.$?.["android:name"] === action)
      );
      if (!exists) {
        queries.intent.push({
          action: [{ $: { "android:name": action } }],
        });
      }
    }

    return config;
  });
};
