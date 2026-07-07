const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PACKAGE_DIR = "@vardrz/react-native-bluetooth-escpos-printer";
const JAVA_REL =
  "android/src/main/java/cn/jystudio/bluetooth/escpos/RNBluetoothEscposPrinterModule.java";

const SEND_RAW_MARKER = "void sendRAWData(String base64";
const PRINT_DUAL_MARKER = "void printDualPic(String base64Left";
const PRINT_RASTER_MARKER = "void printPicRaster(String base64";
const PRINT_PIC_FEED_MARKER = 'options.hasKey("feed") ? options.getInt("feed") : 30';

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

const PRINT_DUAL_METHOD = `
    @ReactMethod
    public void printDualPic(String base64Left, String base64Right, @Nullable ReadableMap options, final Promise promise) {
        try {
            int logoWidth = 180;
            int paperWidthDots = WIDTH_58;
            int feed = 8;
            if (options != null) {
                if (options.hasKey("width")) {
                    logoWidth = options.getInt("width");
                }
                if (options.hasKey("feed")) {
                    feed = options.getInt("feed");
                }
                if (options.hasKey("paperSize") && options.getInt("paperSize") == 80) {
                    paperWidthDots = WIDTH_80;
                }
            }

            byte[] leftBytes = Base64.decode(base64Left, Base64.DEFAULT);
            byte[] rightBytes = Base64.decode(base64Right, Base64.DEFAULT);
            Bitmap leftBmp = BitmapFactory.decodeByteArray(leftBytes, 0, leftBytes.length);
            Bitmap rightBmp = BitmapFactory.decodeByteArray(rightBytes, 0, rightBytes.length);
            if (leftBmp == null || rightBmp == null) {
                promise.reject("INVALID_LOGO", "Could not decode logo bitmap");
                return;
            }

            float leftScale = (float) logoWidth / leftBmp.getWidth();
            float rightScale = (float) logoWidth / rightBmp.getWidth();
            int leftH = Math.round(leftBmp.getHeight() * leftScale);
            int rightH = Math.round(rightBmp.getHeight() * rightScale);
            int maxH = Math.max(leftH, rightH);

            Bitmap scaledLeft = Bitmap.createScaledBitmap(leftBmp, logoWidth, leftH, true);
            Bitmap scaledRight = Bitmap.createScaledBitmap(rightBmp, logoWidth, rightH, true);
            Bitmap combined = Bitmap.createBitmap(paperWidthDots, maxH, Bitmap.Config.ARGB_8888);
            android.graphics.Canvas canvas = new android.graphics.Canvas(combined);
            canvas.drawColor(android.graphics.Color.WHITE);
            canvas.drawBitmap(scaledLeft, 0f, (maxH - leftH) / 2f, null);
            canvas.drawBitmap(scaledRight, (float) (paperWidthDots - logoWidth), (maxH - rightH) / 2f, null);

            byte[] data = PrintPicture.POS_PrintBMP(combined, paperWidthDots, 0, 0);
            if (data != null && sendDataByte(Command.ESC_Init) && sendDataByte(data)) {
                sendDataByte(PrinterCommand.POS_Set_PrtAndFeedPaper(feed));
                promise.resolve(null);
            } else {
                promise.reject("COMMAND_NOT_SEND");
            }
        } catch (Exception e) {
            promise.reject("DUAL_LOGO_FAILED", e);
        }
    }
`;

const PRINT_RASTER_METHOD = `
    @ReactMethod
    public void printPicRaster(String base64, @Nullable ReadableMap options, final Promise promise) {
        try {
            int logoWidth = 200;
            if (options != null && options.hasKey("width")) {
                logoWidth = options.getInt("width");
            }
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bmp == null) {
                promise.reject("INVALID_LOGO", "Could not decode logo bitmap");
                return;
            }

            int targetW = logoWidth;
            int targetH = Math.round(bmp.getHeight() * ((float) targetW / bmp.getWidth()));
            Bitmap scaled = Bitmap.createScaledBitmap(bmp, targetW, targetH, true);

            byte[] data = PrintPicture.POS_PrintBMP(scaled, targetW, 0, 0);
            android.util.Log.i("RasterLogo", "POS_PrintBMP " + targetW + "w returned " + (data == null ? "null" : data.length + " bytes"));
            if (data != null && sendDataByte(Command.ESC_Init) && sendDataByte(data)) {
                int feed = options != null && options.hasKey("feed") ? options.getInt("feed") : 3;
                sendDataByte(PrinterCommand.POS_Set_PrtAndFeedPaper(feed));
                promise.resolve(null);
            } else {
                promise.reject("COMMAND_NOT_SEND");
            }
        } catch (Exception e) {
            promise.reject("RASTER_LOGO_FAILED", e);
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
  let changed = false;

  if (!source.includes(SEND_RAW_MARKER)) {
    const anchor = "    private boolean sendDataByte(byte[] data) {";
    if (!source.includes(anchor)) {
      throw new Error(
        "[withBluetoothRawPrinter] Could not find sendDataByte anchor in RNBluetoothEscposPrinterModule.java"
      );
    }
    source = source.replace(anchor, `${SEND_RAW_METHOD}\n${anchor}`);
    changed = true;
    console.log("[withBluetoothRawPrinter] Added sendRAWData()");
  }

  if (!source.includes(PRINT_DUAL_MARKER)) {
    const anchor = "    private boolean sendDataByte(byte[] data) {";
    source = source.replace(anchor, `${PRINT_DUAL_METHOD}\n${anchor}`);
    changed = true;
    console.log("[withBluetoothRawPrinter] Added printDualPic()");
  }

  if (!source.includes(PRINT_RASTER_MARKER)) {
    const anchor = "    private boolean sendDataByte(byte[] data) {";
    source = source.replace(anchor, `${PRINT_RASTER_METHOD}\n${anchor}`);
    changed = true;
    console.log("[withBluetoothRawPrinter] Added printPicRaster()");
  }

  if (!source.includes(PRINT_PIC_FEED_MARKER)) {
    source = source.replace(
      "            sendDataByte(PrinterCommand.POS_Set_PrtAndFeedPaper(30));",
      `            int feed = options != null && options.hasKey("feed") ? options.getInt("feed") : 30;
            sendDataByte(PrinterCommand.POS_Set_PrtAndFeedPaper(feed));`
    );
    changed = true;
    console.log("[withBluetoothRawPrinter] Added printPic feed option");
  }

  if (changed) {
    fs.writeFileSync(javaPath, source);
  }
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

module.exports.patchBluetoothEscposModule = patchBluetoothEscposModule;

if (require.main === module) {
  patchBluetoothEscposModule(path.join(__dirname, ".."));
}
