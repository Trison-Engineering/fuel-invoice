const {
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");
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
  const aidlDest = path.join(
    platformRoot,
    "app",
    "src",
    "main",
    "aidl"
  );
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

function addPackageToMainApplication(contents) {
  const importLine = "import com.fuelreceipt.app.posaidl.PosAidlPrinterPackage";
  const packageLine = "packages.add(PosAidlPrinterPackage())";

  if (contents.includes(packageLine)) {
    return contents;
  }

  let updated = contents;

  if (!updated.includes(importLine)) {
    updated = updated.replace(
      /(import com\.facebook\.react\.ReactApplication\n)/,
      `$1${importLine}\n`
    );
  }

  if (updated.includes("// packages.add(MyReactNativePackage())")) {
    updated = updated.replace(
      "// packages.add(MyReactNativePackage())",
      `${packageLine}\n              // packages.add(MyReactNativePackage())`
    );
  } else if (updated.includes("return packages")) {
    updated = updated.replace(
      /(\s+)return packages/,
      `$1${packageLine}\n$1return packages`
    );
  }

  return updated;
}

module.exports = function withPosAidlPrinter(config) {
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      copyAidlPrinterSources(
        config.modRequest.projectRoot,
        config.modRequest.platformProjectRoot
      );
      return config;
    },
  ]);

  config = withMainApplication(config, (config) => {
    config.modResults.contents = addPackageToMainApplication(
      config.modResults.contents
    );
    return config;
  });

  return config;
};
