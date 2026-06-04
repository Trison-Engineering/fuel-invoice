const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PLUGIN_DIR = "plugins/pos-aidl-printer";
const AIDL_SOURCE = path.join(PLUGIN_DIR, "aidl");
const KOTLIN_FILES = ["PosAidlPrinterModule.kt", "PosAidlPrinterPackage.kt"];

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

module.exports = function withPosAidlPrinter(config) {
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
