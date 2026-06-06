import { printLogo } from "../src/utils/printLogoUtil";

/** @deprecated Use printLogo from src/utils/printLogoUtil */
export async function printReceiptLogo(options?: {
  logoDataUrl?: string | null;
  includeLogoInPrint?: boolean;
}): Promise<void> {
  if (!options?.includeLogoInPrint || !options.logoDataUrl) {
    return;
  }

  await printLogo({
    logoUri: options.logoDataUrl,
    includeLogoInPrint: options.includeLogoInPrint,
  });
}
