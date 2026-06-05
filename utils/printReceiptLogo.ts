import { printBitmap } from "react-native-nyx-printer";

function dataUrlToByteArray(dataUrl: string): number[] {
  const base64 = dataUrl.replace(/^data:image\/[a-z+]+;base64,/i, "");
  const binary = atob(base64);
  const bytes = new Array<number>(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Print the uploaded station logo when enabled; skip if none uploaded. */
export async function printReceiptLogo(options?: {
  logoDataUrl?: string | null;
  includeLogoInPrint?: boolean;
}): Promise<void> {
  if (!options?.includeLogoInPrint || !options.logoDataUrl) {
    return;
  }

  const bytes = dataUrlToByteArray(options.logoDataUrl);
  const result = await printBitmap(bytes);
  if (result !== 0) {
    throw new Error(`Logo print failed (code ${result})`);
  }
}
