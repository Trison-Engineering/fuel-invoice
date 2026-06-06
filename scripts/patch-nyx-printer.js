/**
 * Patches react-native-nyx-printer so printBitmap accepts both string[] and number[].
 * Run automatically via postinstall and during expo prebuild (withNyxPrinter plugin).
 */
const fs = require("fs");
const path = require("path");

const BITMAP_ARRAY_MARKER = "nyx-printer-bitmap-number-array";
const AIDL_MARKER = "nyx-printer-aidl";

const PATCHED_READABLE_ARRAY_TO_BYTES = `  // ${BITMAP_ARRAY_MARKER}
  public static byte[] readableArrayToByteStringArray(ReadableArray readableArray) {
    List<Byte> bytes = new ArrayList<>(readableArray.size() * 5);
    for (int i = 0; i < readableArray.size(); i++) {
      switch (readableArray.getType(i)) {
        case Number:
          bytes.add((byte) (readableArray.getInt(i) & 0xFF));
          break;
        case String:
          try {
            for (byte b : readableArray.getString(i).getBytes("ISO-8859-1")) {
              bytes.add(b);
            }
          } catch (java.io.UnsupportedEncodingException e) {
            for (byte b : readableArray.getString(i).getBytes()) {
              bytes.add(b);
            }
          }
          break;
        default:
          break;
      }
    }

    byte[] bytesArr = new byte[bytes.size()];
    for (int i = 0; i < bytes.size(); i++) {
      bytesArr[i] = bytes.get(i);
    }

    return bytesArr;
  }`;

function enableAidlInNyxBuildGradle(contents) {
  if (contents.includes(AIDL_MARKER) || /buildFeatures\s*\{[^}]*aidl\s+true/.test(contents)) {
    return contents;
  }

  const aidlBlock = `  // ${AIDL_MARKER}
  buildFeatures {
    aidl true
  }

`;

  if (/buildFeatures\s*\{/.test(contents)) {
    if (/aidl\s+true/.test(contents)) {
      return contents;
    }
    return contents.replace(/buildFeatures\s*\{/, (match) => `${match}\n    aidl true`);
  }

  return contents.replace(
    /compileOptions\s*\{[\s\S]*?\}\n\n/,
    (match) => `${match}${aidlBlock}`
  );
}

function patchUtilsJava(utilsPath) {
  if (!fs.existsSync(utilsPath)) {
    return false;
  }

  let contents = fs.readFileSync(utilsPath, "utf8");
  if (contents.includes(BITMAP_ARRAY_MARKER)) {
    return true;
  }

  const methodPattern =
    /public static byte\[] readableArrayToByteStringArray\(ReadableArray readableArray\) \{[\s\S]*?\n  \}/;

  if (!methodPattern.test(contents)) {
    console.warn("[patch-nyx-printer] readableArrayToByteStringArray not found");
    return false;
  }

  contents = contents.replace(methodPattern, PATCHED_READABLE_ARRAY_TO_BYTES);
  fs.writeFileSync(utilsPath, contents);
  return true;
}

function patchBuildGradle(gradlePath) {
  if (!fs.existsSync(gradlePath)) {
    return false;
  }

  const original = fs.readFileSync(gradlePath, "utf8");
  const patched = enableAidlInNyxBuildGradle(original);
  if (patched !== original) {
    fs.writeFileSync(gradlePath, patched);
  }
  return true;
}

function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const nyxRoot = path.join(projectRoot, "node_modules", "react-native-nyx-printer");

  if (!fs.existsSync(nyxRoot)) {
    return;
  }

  const utilsPath = path.join(
    nyxRoot,
    "android",
    "src",
    "main",
    "java",
    "com",
    "nyxprinter",
    "Utils.java"
  );
  const gradlePath = path.join(nyxRoot, "android", "build.gradle");

  const utilsOk = patchUtilsJava(utilsPath);
  const gradleOk = patchBuildGradle(gradlePath);

  if (utilsOk) {
    console.log("[patch-nyx-printer] Patched Utils.java for printBitmap");
  }
  if (gradleOk) {
    console.log("[patch-nyx-printer] Verified NYX build.gradle");
  }
}

main();
