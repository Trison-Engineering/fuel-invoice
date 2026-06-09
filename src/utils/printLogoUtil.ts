import { LOGO_MAX_SIZE } from "../../constants/printerPaper";

export interface LogoPrintOptions {
  logoUri: string;
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

/** Logo on thermal receipt is passed via SunmiPrinterModule.printReceipt — no separate native call. */
export async function printLogo(_options: LogoPrintOptions): Promise<boolean> {
  return false;
}

export { LOGO_MAX_SIZE };
