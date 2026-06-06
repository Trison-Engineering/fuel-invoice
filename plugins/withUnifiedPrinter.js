const {
  withAndroidManifest,
  withAppBuildGradle,
  withMainApplication,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PLUGIN_DIR = "plugins/unified-printer";
const SUNMI_AIDL_SOURCE = path.join(PLUGIN_DIR, "aidl", "woyou");
const KOTLIN_FILES = [
  "BitmapScaler.kt",
  "DeviceDetector.kt",
  "NyxPrinterBridge.kt",
  "SunmiPrinterBridge.kt",
  "UnifiedPrinterModule.kt",
  "UnifiedPrinterPackage.kt",
];
const AIDL_MARKER = "unified-printer-aidl";

const SUNMI_PACKAGE = "woyou.stu.sdkservice";
const SUNMI_ACTION = "woyou.stu.sdkservice.sdkservice";
const NYX_PACKAGE = "net.nyx.printerservice";

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyUnifiedPrinterSources(projectRoot, platformRoot) {
  // Sunmi AIDL only — NYX types come from react-native-nyx-printer (avoid duplicate AIDL).
  copyRecursive(
    path.join(projectRoot, SUNMI_AIDL_SOURCE),
    path.join(platformRoot, "app", "src", "main", "aidl", "woyou")
  );

  // Remove legacy NYX AIDL/Java copied by earlier plugin versions (EAS reuses android/).
  const stalePaths = [
    path.join(platformRoot, "app", "src", "main", "aidl", "net"),
    path.join(platformRoot, "app", "src", "main", "java", "net", "nyx"),
  ];
  for (const stalePath of stalePaths) {
    if (fs.existsSync(stalePath)) {
      fs.rmSync(stalePath, { recursive: true, force: true });
    }
  }

  const kotlinDest = path.join(
    platformRoot,
    "app",
    "src",
    "main",
    "java",
    "com",
    "fuelreceipt",
    "app",
    "unifiedprinter"
  );
  fs.mkdirSync(kotlinDest, { recursive: true });
  for (const file of KOTLIN_FILES) {
    fs.copyFileSync(path.join(projectRoot, PLUGIN_DIR, file), path.join(kotlinDest, file));
  }
}

function enableAidlInBuildGradle(contents) {
  if (contents.includes(AIDL_MARKER)) {
    return contents;
  }

  const aidlBlock = `    // ${AIDL_MARKER}
    buildFeatures {
        aidl true
    }
`;

  if (/buildFeatures\s*\{/.test(contents)) {
    if (/aidl\s+true/.test(contents)) {
      return contents;
    }
    return contents.replace(/buildFeatures\s*\{/, (match) => `${match}
        aidl true`);
  }

  return contents.replace(/android\s*\{/, `android {\n${aidlBlock}`);
}

function addPackageToMainApplication(contents) {
  const importLine = "import com.fuelreceipt.app.unifiedprinter.UnifiedPrinterPackage";
  const packageLine = "packages.add(UnifiedPrinterPackage())";

  let updated = contents;
  if (!updated.includes(importLine)) {
    updated = updated.replace(
      /(import com\.facebook\.react\.ReactApplication\n)/,
      `$1${importLine}\n`
    );
  }

  if (updated.includes(packageLine)) {
    return updated;
  }

  if (updated.includes("return packages")) {
    updated = updated.replace(/(\s+)return packages/, `$1${packageLine}\n$1return packages`);
  }

  return updated;
}

function ensureManifestQueries(manifest) {
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

  for (const packageName of [SUNMI_PACKAGE, NYX_PACKAGE]) {
    const exists = queries.package.some((entry) => entry.$?.["android:name"] === packageName);
    if (!exists) {
      queries.package.push({ $: { "android:name": packageName } });
    }
  }

  const intentExists = queries.intent.some((entry) =>
    entry.action?.some((a) => a.$?.["android:name"] === SUNMI_ACTION)
  );
  if (!intentExists) {
    queries.intent.push({
      action: [{ $: { "android:name": SUNMI_ACTION } }],
    });
  }

  return manifest;
}

module.exports = function withUnifiedPrinter(config) {
  config = withAndroidManifest(config, (config) => {
    config.modResults.manifest = ensureManifestQueries(config.modResults.manifest);
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    config.modResults.contents = enableAidlInBuildGradle(config.modResults.contents);
    return config;
  });

  config = withMainApplication(config, (config) => {
    config.modResults.contents = addPackageToMainApplication(config.modResults.contents);
    return config;
  });

  return withDangerousMod(config, [
    "android",
    async (config) => {
      copyUnifiedPrinterSources(
        config.modRequest.projectRoot,
        config.modRequest.platformProjectRoot
      );
      return config;
    },
  ]);
};
