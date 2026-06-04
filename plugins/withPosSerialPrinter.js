const {
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SOURCE_DIR = "plugins/pos-serial-printer";
const DEST_RELATIVE = path.join(
  "app",
  "src",
  "main",
  "java",
  "com",
  "fuelreceipt",
  "app",
  "posserial"
);

function copySerialSources(projectRoot, platformRoot) {
  const srcDir = path.join(projectRoot, SOURCE_DIR);
  const destDir = path.join(platformRoot, DEST_RELATIVE);

  fs.mkdirSync(destDir, { recursive: true });

  for (const file of ["PosSerialPrinterModule.kt", "PosSerialPrinterPackage.kt"]) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
}

function addPackageToMainApplication(contents) {
  const importLine = "import com.fuelreceipt.app.posserial.PosSerialPrinterPackage";
  const packageLine = "packages.add(PosSerialPrinterPackage())";

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

module.exports = function withPosSerialPrinter(config) {
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      copySerialSources(
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
