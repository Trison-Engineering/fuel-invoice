import * as FileSystem from "expo-file-system";
import { paperOut, printBitmap } from "react-native-nyx-printer";

const SDK_OK = 0;
const CHUNK_SIZE = 8192;

export interface LogoPrintOptions {
  logoUri: string;
  /** Target bitmap width in dots — defaults to 2" Sunmi paper width. */
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

/**
 * NYX native printBitmap expects ReadableArray of Strings (not numbers).
 * Passing number[] causes: java.lang.Double cannot be cast to java.lang.String
 */
function bytesToBitmapArg(bytes: number[]): string[] {
  const chunks: string[] = [];
  let chunk = "";
  for (let i = 0; i < bytes.length; i++) {
    chunk += String.fromCharCode(bytes[i] & 0xff);
    if (chunk.length >= CHUNK_SIZE) {
      chunks.push(chunk);
      chunk = "";
    }
  }
  if (chunk.length > 0) {
    chunks.push(chunk);
  }
  return chunks;
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
    const bitmapArg = bytesToBitmapArg(bytes);

    const result = await printBitmap(bitmapArg as unknown as number[]);
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
