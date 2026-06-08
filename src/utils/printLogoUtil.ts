import { NativeModules } from "react-native";

import { LOGO_MAX_SIZE } from "../../constants/printerPaper";

const { UnifiedPrinterModule } = NativeModules;
const SDK_OK = 0;

export interface LogoPrintOptions {
  logoUri: string;
  /** Max width/height in dots — defaults to LOGO_MAX_SIZE (100). */
  maxSize?: number;
  align?: number;
  includeLogoInPrint?: boolean;
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

/** Print uploaded station logo; never throws — returns false on skip/failure. */
export async function printLogo(options: LogoPrintOptions): Promise<boolean> {
  const { logoUri, align = 1, includeLogoInPrint = true } = options;

  if (!includeLogoInPrint || !logoUri || !UnifiedPrinterModule) {
    return false;
  }

  try {
    const base64Data = await resolveLogoBase64(logoUri);
    if (!base64Data) {
      console.log("Could not read logo data");
      return false;
    }

    await UnifiedPrinterModule.printBitmapBase64(base64Data, align);
    // Sunmi: skip paperOut — lineWrap() triggers diagnostic output on V2s.
    const deviceType = (await UnifiedPrinterModule.getDeviceType?.()) as string | undefined;
    if (deviceType === "SUNMI") {
      return true;
    }
    const feedCode = await UnifiedPrinterModule.paperOut(1);
    if (feedCode !== SDK_OK && feedCode < 0) {
      console.log(`Logo feed failed (code ${feedCode})`);
      return false;
    }

    return true;
  } catch (error) {
    console.log("Logo print failed, continuing without logo:", error);
    return false;
  }
}
