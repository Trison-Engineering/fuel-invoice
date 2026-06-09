const { withAndroidManifest } = require("@expo/config-plugins");

const SUNMI_JIUIV5 = "woyou.aidlservice.jiuiv5";
const SUNMI_JIUIV5_ACTION = "woyou.aidlservice.jiuiv5.IWoyouService";

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

    const packageExists = queries.package.some(
      (entry) => entry.$?.["android:name"] === SUNMI_JIUIV5
    );
    if (!packageExists) {
      queries.package.push({ $: { "android:name": SUNMI_JIUIV5 } });
    }

    const intentExists = queries.intent.some((entry) =>
      entry.action?.some((a) => a.$?.["android:name"] === SUNMI_JIUIV5_ACTION)
    );
    if (!intentExists) {
      queries.intent.push({
        action: [{ $: { "android:name": SUNMI_JIUIV5_ACTION } }],
      });
    }

    return config;
  });
};
