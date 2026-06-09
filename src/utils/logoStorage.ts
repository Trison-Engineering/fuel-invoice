import AsyncStorage from "@react-native-async-storage/async-storage";
import { preprocessLogoForPrinting, resolveLogoBase64 } from "./printLogoUtil";

/** Raw AsyncStorage keys used by Bluetooth printLogo (no @fuel_receipt: prefix). */
export const RawLogoKeys = {
  LOGO_1: "station_logo",
  LOGO_2: "station_logo_2",
  USE_TWO_LOGOS: "use_two_logos",
} as const;

async function toStoredLogoValue(logoDataUrl: string | null): Promise<string | null> {
  if (!logoDataUrl) return null;
  try {
    return await preprocessLogoForPrinting(logoDataUrl);
  } catch {
    const base64 = await resolveLogoBase64(logoDataUrl).catch(() => null);
    return base64 ?? logoDataUrl;
  }
}

export async function syncRawLogoStorage(params: {
  logoDataUrl: string | null;
  logo2DataUrl: string | null;
  useTwoLogos: boolean;
}): Promise<void> {
  const logo1 = await toStoredLogoValue(params.logoDataUrl);
  if (logo1) {
    await AsyncStorage.setItem(RawLogoKeys.LOGO_1, logo1);
  } else {
    await AsyncStorage.removeItem(RawLogoKeys.LOGO_1);
  }

  const logo2 = await toStoredLogoValue(params.logo2DataUrl);
  if (logo2) {
    await AsyncStorage.setItem(RawLogoKeys.LOGO_2, logo2);
  } else {
    await AsyncStorage.removeItem(RawLogoKeys.LOGO_2);
  }

  await AsyncStorage.setItem(
    RawLogoKeys.USE_TWO_LOGOS,
    params.useTwoLogos ? "true" : "false"
  );
}

export async function clearRawLogoStorage(): Promise<void> {
  await AsyncStorage.multiRemove([
    RawLogoKeys.LOGO_1,
    RawLogoKeys.LOGO_2,
    RawLogoKeys.USE_TWO_LOGOS,
  ]);
}

export function cleanLogoBase64(logo: string): string {
  if (logo.includes(",")) {
    return logo.split(",")[1] ?? logo;
  }
  return logo;
}
