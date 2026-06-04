const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SUNMI_MODULE_REL = path.join(
  "node_modules",
  "@heasy",
  "react-native-sunmi-printer",
  "android",
  "src",
  "main",
  "java",
  "com",
  "reactnativesunmiprinter",
  "SunmiPrinterModule.java"
);

const SUNMI_BUILD_GRADLE_REL = path.join(
  "node_modules",
  "@heasy",
  "react-native-sunmi-printer",
  "android",
  "build.gradle"
);

function patchSunmiModule(contents) {
  let updated = contents;

  updated = updated.replace(
    "    } catch (RemoteException e) {\n      Log.i(TAG, \"ERROR: \" + e.getMessage());\n    }",
    "    } catch (Exception e) {\n      Log.i(TAG, \"ERROR: \" + e.getMessage());\n    }"
  );

  if (!updated.includes("if (printerService == null)")) {
    updated = updated.replace(
      "  public void printerInit() throws RemoteException {\n    printerService.printerInit(innerResultCallback);\n  }",
      `  public void printerInit() throws RemoteException {
    if (printerService == null) {
      Log.i(TAG, "ERROR: printer service not connected");
      return;
    }
    printerService.printerInit(innerResultCallback);
  }`
    );

    updated = updated.replace(
      "  public void sendRAWData(String base64Data) throws RemoteException {\n    final byte[] d = Base64.decode(base64Data, Base64.DEFAULT);\n    printerService.sendRAWData(d, innerResultCallback);\n  }",
      `  public void sendRAWData(String base64Data) throws RemoteException {
    if (printerService == null) {
      Log.i(TAG, "ERROR: printer service not connected");
      return;
    }
    final byte[] d = Base64.decode(base64Data, Base64.DEFAULT);
    printerService.sendRAWData(d, innerResultCallback);
  }`
    );

    updated = updated.replace(
      "  public void updatePrinterState(Promise promise) {\n    try {\n      promise.resolve(printerService.updatePrinterState());",
      `  public void updatePrinterState(Promise promise) {
    try {
      if (printerService == null) {
        promise.resolve(0);
        return;
      }
      promise.resolve(printerService.updatePrinterState());`
    );
  }

  return updated;
}

function patchSunmiBuildGradle(contents) {
  return contents.replace(
    '  implementation "com.sunmi:printerlibrary:1.0.13"\n  implementation "com.sunmi:printerlibrary:1.0.18"',
    '  implementation "com.sunmi:printerlibrary:1.0.18"'
  );
}

module.exports = function withSunmiPrinterPatch(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const modulePath = path.join(projectRoot, SUNMI_MODULE_REL);
      const gradlePath = path.join(projectRoot, SUNMI_BUILD_GRADLE_REL);

      if (fs.existsSync(modulePath)) {
        const patched = patchSunmiModule(fs.readFileSync(modulePath, "utf8"));
        fs.writeFileSync(modulePath, patched);
      }

      if (fs.existsSync(gradlePath)) {
        const patchedGradle = patchSunmiBuildGradle(fs.readFileSync(gradlePath, "utf8"));
        fs.writeFileSync(gradlePath, patchedGradle);
      }

      return config;
    },
  ]);
};
