const { withDangerousMod, withAppBuildGradle } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PLUGIN_DIR = "plugins/pos-aidl-printer";
const AIDL_SOURCE = path.join(PLUGIN_DIR, "aidl");
const KOTLIN_FILES = ["PosAidlPrinterModule.kt", "PosAidlPrinterPackage.kt"];
const AIDL_MARKER = "pos-aidl-printer";

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

function copyAidlPrinterSources(projectRoot, platformRoot) {
  const aidlDest = path.join(platformRoot, "app", "src", "main", "aidl");
  const kotlinDest = path.join(
    platformRoot,
    "app",
    "src",
    "main",
    "java",
    "com",
    "fuelreceipt",
    "app",
    "posaidl"
  );

  copyRecursive(path.join(projectRoot, AIDL_SOURCE), aidlDest);

  fs.mkdirSync(kotlinDest, { recursive: true });
  for (const file of KOTLIN_FILES) {
    fs.copyFileSync(
      path.join(projectRoot, PLUGIN_DIR, file),
      path.join(kotlinDest, file)
    );
  }
}

/** AGP 8+ disables AIDL unless buildFeatures.aidl is true. */
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
    return contents.replace(/buildFeatures\s*\{/, (match) => {
      return `${match}
        aidl true`;
    });
  }

  return contents.replace(/android\s*\{/, `android {\n${aidlBlock}`);
}

module.exports = function withPosAidlPrinter(config) {
  config = withAppBuildGradle(config, (config) => {
    config.modResults.contents = enableAidlInBuildGradle(
      config.modResults.contents
    );
    return config;
  });

  return withDangerousMod(config, [
    "android",
    async (config) => {
      copyAidlPrinterSources(
        config.modRequest.projectRoot,
        config.modRequest.platformProjectRoot
      );
      return config;
    },
  ]);
};
