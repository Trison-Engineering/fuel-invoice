const { withAndroidManifest } = require("@expo/config-plugins");

const NYX_PACKAGE = "net.nyx.printerservice";
const NYX_ACTION = "net.nyx.printerservice.IPrinterService";

module.exports = function withNyxPrinter(config) {
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

    const packageExists = queries.package.some(
      (entry) => entry.$?.["android:name"] === NYX_PACKAGE
    );
    if (!packageExists) {
      queries.package.push({
        $: { "android:name": NYX_PACKAGE },
      });
    }

    const intentExists = queries.intent.some((entry) =>
      entry.action?.some((a) => a.$?.["android:name"] === NYX_ACTION)
    );
    if (!intentExists) {
      queries.intent.push({
        action: [{ $: { "android:name": NYX_ACTION } }],
      });
    }

    return config;
  });
};
