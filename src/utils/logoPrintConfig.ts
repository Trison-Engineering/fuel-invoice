import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { THERMAL_PAPER_WIDTH_DOTS } from "./printLogoUtil";

/** Raw AsyncStorage key — no @fuel_receipt: prefix (per-device tuning). */
export const LOGO_PRINT_WIDTH_KEY = "logo_print_width";

export const DEFAULT_LOGO_WIDTH_V2S = 192;
export const DEFAULT_LOGO_WIDTH_VSTC = 96;

export const LOGO_PRINT_WIDTH_OPTIONS = [48, 72, 96, 128, 160, 192] as const;

/** Preprocess-to-print ratio for V2s_GL at 192 dots (576 / 192 = 3). */
export const LOGO_PREPROCESS_RATIO = 3;

export const getDeviceModel = (): string => {
  try {
    const constants = Platform.constants as { Model?: string };
    return constants.Model ?? "";
  } catch {
    return "";
  }
};

export const isV2sGLDevice = (model: string): boolean => {
  const lower = model.toLowerCase();
  return lower.includes("v2s_gl") || (lower.includes("v2s") && !lower.includes("vstc"));
};

export const isVSTCDevice = (model: string): boolean => {
  return model.toLowerCase().includes("vstc");
};

export async function getSavedLogoPrintWidth(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(LOGO_PRINT_WIDTH_KEY);
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

export async function setSavedLogoPrintWidth(width: number | null): Promise<void> {
  if (width == null) {
    await AsyncStorage.removeItem(LOGO_PRINT_WIDTH_KEY);
    return;
  }
  await AsyncStorage.setItem(LOGO_PRINT_WIDTH_KEY, String(width));
}

export function logoLeftMargin(printWidthDots: number): number {
  return Math.floor((THERMAL_PAPER_WIDTH_DOTS - printWidthDots) / 2);
}

export async function resolveLogoPrintLayout(): Promise<{
  width: number;
  left: number;
  saved: boolean;
  model: string;
  isV2s: boolean;
  isVstc: boolean;
}> {
  const model = getDeviceModel();
  const isV2s = isV2sGLDevice(model);
  const isVstc = isVSTCDevice(model);
  const saved = await getSavedLogoPrintWidth();

  let width: number;
  if (saved != null) {
    width = saved;
  } else if (isVstc) {
    width = DEFAULT_LOGO_WIDTH_VSTC;
  } else {
    width = DEFAULT_LOGO_WIDTH_V2S;
  }

  return {
    width,
    left: logoLeftMargin(width),
    saved: saved != null,
    model,
    isV2s,
    isVstc,
  };
}
