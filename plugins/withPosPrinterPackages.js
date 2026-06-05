const { withMainApplication } = require("@expo/config-plugins");

const PACKAGE_IMPORTS = [
  "import com.fuelreceipt.app.posaidl.PosAidlPrinterPackage",
  "import com.fuelreceipt.app.posserial.PosSerialPrinterPackage",
  "import com.fuelreceipt.app.posclassicbt.PosClassicBtPrinterPackage",
];

const PACKAGE_LINES = [
  "packages.add(PosAidlPrinterPackage())",
  "packages.add(PosSerialPrinterPackage())",
  "packages.add(PosClassicBtPrinterPackage())",
];

function addPackagesToMainApplication(contents) {
  let updated = contents;

  for (const importLine of PACKAGE_IMPORTS) {
    if (!updated.includes(importLine)) {
      updated = updated.replace(
        /(import com\.facebook\.react\.ReactApplication\n)/,
        `$1${importLine}\n`
      );
    }
  }

  const block = PACKAGE_LINES.join("\n            ");
  if (updated.includes(PACKAGE_LINES[0])) {
    return updated;
  }

  if (updated.includes("return packages")) {
    updated = updated.replace(
      /(\s+)return packages/,
      `$1${block}\n$1return packages`
    );
  }

  return updated;
}

module.exports = function withPosPrinterPackages(config) {
  return withMainApplication(config, (config) => {
    config.modResults.contents = addPackagesToMainApplication(
      config.modResults.contents
    );
    return config;
  });
};
