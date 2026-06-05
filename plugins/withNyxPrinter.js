const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const NYX_PACKAGE = "net.nyx.printerservice";
const NYX_ACTION = "net.nyx.printerservice.IPrinterService";
const AIDL_MARKER = "nyx-printer-aidl";

function enableAidlInNyxBuildGradle(contents) {
  if (contents.includes(AIDL_MARKER) || /buildFeatures\s*\{[^}]*aidl\s+true/.test(contents)) {
    return contents;
  }

  const aidlBlock = `  // ${AIDL_MARKER}
  buildFeatures {
    aidl true
  }

`;

  if (/buildFeatures\s*\{/.test(contents)) {
    if (/aidl\s+true/.test(contents)) {
      return contents;
    }
    return contents.replace(/buildFeatures\s*\{/, (match) => {
      return `${match}
    aidl true`;
    });
  }

  return contents.replace(
    /compileOptions\s*\{[\s\S]*?\}\n\n/,
    (match) => `${match}${aidlBlock}`
  );
}

function patchNyxPrinterGradle(projectRoot) {
  const gradlePath = path.join(
    projectRoot,
    "node_modules",
    "react-native-nyx-printer",
    "android",
    "build.gradle"
  );

  if (!fs.existsSync(gradlePath)) {
    return;
  }

  const original = fs.readFileSync(gradlePath, "utf8");
  const patched = enableAidlInNyxBuildGradle(original);
  if (patched !== original) {
    fs.writeFileSync(gradlePath, patched);
  }
}

module.exports = function withNyxPrinter(config) {
  config = withAndroidManifest(config, (config) => {
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

  return withDangerousMod(config, [
    "android",
    async (config) => {
      patchNyxPrinterGradle(config.modRequest.projectRoot);
      return config;
    },
  ]);
};
