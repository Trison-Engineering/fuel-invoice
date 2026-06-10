import { Platform } from "react-native";

export const V2S_DEFAULT_LOGO_WIDTH = 192;
export const VSTC_TARGET_LOGO_WIDTH = 192;

/**
 * printPic input that compensates for VSTC package GS v 0 width bug.
 * package_output_bytes = (input / 8) + 12 → 96 gives 24 bytes = 192 dots.
 * If 96 still blank try: width = 72 → (72/8) + 12 = 21 bytes = 168 dots.
 */
export const VSTC_CORRECTED_PRINT_WIDTH = 96;

export const getDeviceModel = (): string => {
  try {
    const constants = Platform.constants as { Model?: string };
    return constants.Model ?? "";
  } catch {
    return "";
  }
};

export const isVSTCDevice = (model: string): boolean => {
  return model.toLowerCase().includes("vstc");
};
