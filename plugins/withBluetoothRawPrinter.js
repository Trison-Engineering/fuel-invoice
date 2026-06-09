const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PACKAGE_DIR = "@vardrz/react-native-bluetooth-escpos-printer";
const JAVA_REL =
  "android/src/main/java/cn/jystudio/bluetooth/escpos/RNBluetoothEscposPrinterModule.java";
const MARKER = "void sendRAWData(String base64";

const SEND_RAW_METHOD = `
    @ReactMethod
    public void sendRAWData(String base64, final Promise promise) {
        try {
            byte[] data = Base64.decode(base64, Base64.DEFAULT);
            if (data == null || data.length == 0) {
                promise.reject("RAW_EMPTY", "No raw data to send");
                return;
            }
            if (sendDataByte(data)) {
                promise.resolve(null);
            } else {
                promise.reject("COMMAND_NOT_SEND");
            }
        } catch (Exception e) {
            promise.reject("RAW_SEND_FAILED", e);
        }
    }
`;

function patchBluetoothEscposModule(projectRoot) {
  const javaPath = path.join(projectRoot, "node_modules", PACKAGE_DIR, JAVA_REL);
  if (!fs.existsSync(javaPath)) {
    console.warn(`[withBluetoothRawPrinter] Module not found: ${javaPath}`);
    return;
  }

  let source = fs.readFileSync(javaPath, "utf8");
  if (source.includes(MARKER)) {
    return;
  }

  const anchor = "    private boolean sendDataByte(byte[] data) {";
  if (!source.includes(anchor)) {
    throw new Error(
      "[withBluetoothRawPrinter] Could not find sendDataByte anchor in RNBluetoothEscposPrinterModule.java"
    );
  }

  source = source.replace(anchor, `${SEND_RAW_METHOD}\n${anchor}`);
  fs.writeFileSync(javaPath, source);
  console.log("[withBluetoothRawPrinter] Added sendRAWData() to BluetoothEscposPrinter native module");
}

module.exports = function withBluetoothRawPrinter(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      patchBluetoothEscposModule(config.modRequest.projectRoot);
      return config;
    },
  ]);
};
