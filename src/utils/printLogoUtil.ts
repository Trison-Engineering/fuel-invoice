import * as FileSystem from "expo-file-system";
import { paperOut, printBitmap } from "react-native-nyx-printer";

const SDK_OK = 0;

export interface LogoPrintOptions {
  logoUri: string;
  width?: number;
  align?: number;
  includeLogoInPrint?: boolean;
}

function base64ToByteArray(base64: string): number[] {
  const binary = atob(base64);
  const bytes = new Array<number>(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function resolveBase64(logoUri: string): Promise<string | null> {
  if (!logoUri) return null;

  if (logoUri.startsWith("data:image")) {
    const comma = logoUri.indexOf(",");
    return comma >= 0 ? logoUri.slice(comma + 1) : null;
  }

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
  const { logoUri, includeLogoInPrint = true } = options;

  if (!includeLogoInPrint || !logoUri) {
    return false;
  }

  try {
    const base64Data = await resolveBase64(logoUri);
    if (!base64Data) {
      console.log("Could not read logo data");
      return false;
    }

    const bytes = base64ToByteArray(base64Data);
    const result = await printBitmap(bytes);
    if (result !== SDK_OK) {
      console.log(`Logo print failed (code ${result})`);
      return false;
    }

    await paperOut();
    return true;
  } catch (error) {
    console.log("Logo print failed, continuing without logo:", error);
    return false;
  }
}
