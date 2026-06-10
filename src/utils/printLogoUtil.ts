import * as ImageManipulator from "expo-image-manipulator";
import { LOGO_MAX_SIZE } from "../../constants/printerPaper";
import { cleanLogoBase64 } from "./logoStorage";

/** Sunmi 58mm printable width in dots. */
export const THERMAL_PAPER_WIDTH_DOTS = 384;

/** Preprocess width: 384 dots × 1.5 for sharp thermal output. */
export const LOGO_PREPROCESS_WIDTH = 576;

export const LOGO_PRINT_WIDTH_SINGLE = THERMAL_PAPER_WIDTH_DOTS;
export const LOGO_PRINT_WIDTH_DUAL = 180;
export const LOGO_PRINT_DUAL_RIGHT_LEFT = 204;

export interface LogoPrintOptions {
  logoUri: string;
  maxSize?: number;
  align?: number;
  includeLogoInPrint?: boolean;
}

function toManipulatorUri(source: string): string {
  if (source.startsWith("data:") || source.startsWith("file://")) {
    return source;
  }
  return `data:image/png;base64,${cleanLogoBase64(source)}`;
}

/** V2s_GL default print width — preprocess is 576px (3×). */
const V2S_DEFAULT_PRINT_WIDTH_DOTS = 192;

/** Resize logo to optimal thermal resolution before print (576px wide PNG). */
export async function preprocessLogoForPrinting(source: string): Promise<string> {
  return preprocessLogoForPrintWidth(source, V2S_DEFAULT_PRINT_WIDTH_DOTS);
}

/** Resize logo so preprocess width scales with print width (576px @ 192 dots = 3×). */
export async function preprocessLogoForPrintWidth(
  source: string,
  printWidthDots: number
): Promise<string> {
  const preprocessWidth = Math.max(
    8,
    Math.round(printWidthDots * (LOGO_PREPROCESS_WIDTH / V2S_DEFAULT_PRINT_WIDTH_DOTS))
  );

  try {
    const result = await ImageManipulator.manipulateAsync(
      toManipulatorUri(source),
      [{ resize: { width: preprocessWidth } }],
      {
        compress: 1,
        format: ImageManipulator.SaveFormat.PNG,
        base64: true,
      }
    );

    if (result.base64) {
      console.log(
        "[Logo] preprocessLogoForPrintWidth:",
        printWidthDots,
        "dots →",
        preprocessWidth,
        "px"
      );
      return result.base64;
    }
  } catch (e) {
    console.warn("[Logo] preprocessLogoForPrintWidth failed, using original:", e);
  }

  return cleanLogoBase64(source);
}

/** Resize and store logo at optimal resolution when user uploads. */
export async function preprocessLogoForUpload(source: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      toManipulatorUri(source),
      [{ resize: { width: LOGO_PREPROCESS_WIDTH } }],
      {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.PNG,
        base64: true,
      }
    );

    if (result.base64) {
      return `data:image/png;base64,${result.base64}`;
    }
  } catch (e) {
    console.warn("[Logo] preprocessLogoForUpload failed, using original:", e);
  }

  if (source.startsWith("data:")) {
    return source;
  }

  return `data:image/png;base64,${cleanLogoBase64(source)}`;
}

/** Resolve logo URI to base64 PNG/JPEG data (no data: prefix). */
export async function resolveLogoBase64(logoUri: string): Promise<string | null> {
  if (!logoUri) return null;

  if (logoUri.startsWith("data:image")) {
    const comma = logoUri.indexOf(",");
    return comma >= 0 ? logoUri.slice(comma + 1) : null;
  }

  const FileSystem = await import("expo-file-system");
  if (logoUri.startsWith("file://")) {
    return FileSystem.readAsStringAsync(logoUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  if (logoUri.startsWith("http://") || logoUri.startsWith("https://")) {
    const response = await fetch(logoUri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : null);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  return logoUri;
}

/** @deprecated Legacy no-op — Bluetooth printLogo handles printing. */
export async function printLogo(_options: LogoPrintOptions): Promise<boolean> {
  return false;
}

export { LOGO_MAX_SIZE };
