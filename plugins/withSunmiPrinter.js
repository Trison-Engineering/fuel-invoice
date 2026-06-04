const { withAndroidManifest } = require("@expo/config-plugins");

const POS_PRINTER_PACKAGES = [
  "com.iposprinter.iposprinterservice",
  "woyou.aidlservice.jiuiv5",
  "com.sunmi.peripheral.printer",
  "net.nyx.printerservice",
  "com.android.printspooler",
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

    return config;
  });
};
