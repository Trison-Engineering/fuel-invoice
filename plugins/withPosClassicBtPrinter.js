const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SOURCE_DIR = "plugins/pos-classic-bt-printer";
const DEST_RELATIVE = path.join(
  "app",
  "src",
  "main",
  "java",
  "com",
  "fuelreceipt",
  "app",
  "posclassicbt"
);

function copyClassicBtSources(projectRoot, platformRoot) {
  const srcDir = path.join(projectRoot, SOURCE_DIR);
  const destDir = path.join(platformRoot, DEST_RELATIVE);

  fs.mkdirSync(destDir, { recursive: true });

  for (const file of ["PosClassicBtPrinterModule.kt", "PosClassicBtPrinterPackage.kt"]) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
}

module.exports = function withPosClassicBtPrinter(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      copyClassicBtSources(
        config.modRequest.projectRoot,
        config.modRequest.platformProjectRoot
      );
      return config;
    },
  ]);
};
