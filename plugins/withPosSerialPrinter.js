const { withDangerousMod } = require("@expo/config-plugins");
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

module.exports = function withPosSerialPrinter(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      copySerialSources(
        config.modRequest.projectRoot,
        config.modRequest.platformProjectRoot
      );
      return config;
    },
  ]);
};
