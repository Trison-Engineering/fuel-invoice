/**
 * Sunmi V2s / EzPump — 58 mm thermal roll (384-dot printable width).
 *
 * Characters per line (Sunmi spec):
 *   24px small  → ~32 chars
 *   32px normal → ~24 chars
 *   40px large  → ~18 chars
 *   48px xlarge → ~16 chars
 */
export const PAPER_WIDTH_MM = 58;
export const PAPER_WIDTH_INCHES = Math.round((PAPER_WIDTH_MM / 25.4) * 10) / 10;

/** Printable bitmap width in dots (58 mm paper). */
export const SUNMI_BITMAP_WIDTH = 384;

/** Paper roll outer diameter (mm). */
export const PAPER_ROLL_DIAMETER_MM = 40;

/** Chars per line at each Sunmi font tier. */
export const SUNMI_CHARS_PER_LINE = {
  small: 32,
  normal: 24,
  large: 18,
  xlarge: 16,
} as const;

/** NYX textSize values — original sizes, validated on 58 mm paper. */
export const RECEIPT_FONT = {
  body: 18,
  heading: 20,
  storeName: 22,
  total: 20,
} as const;

/** Resolve monospace chars that fit one line for a given font size (px). */
export function charsPerLineForFontSize(fontSize: number): number {
  if (fontSize >= 48) return SUNMI_CHARS_PER_LINE.xlarge;
  if (fontSize >= 40) return SUNMI_CHARS_PER_LINE.large;
  if (fontSize >= 32) return SUNMI_CHARS_PER_LINE.normal;
  return SUNMI_CHARS_PER_LINE.small;
}

/** Body row width at 24px-tier on 58 mm paper. */
export const RECEIPT_LINE_WIDTH = SUNMI_CHARS_PER_LINE.small;

/** Header wrap width (store name / address at ~32px normal tier). */
export const RECEIPT_HEADER_LINE_WIDTH = SUNMI_CHARS_PER_LINE.normal;

/** Max logo width and height in dots when printing on thermal paper. */
export const LOGO_MAX_SIZE = 100;

/** @deprecated Use LOGO_MAX_SIZE — kept for existing imports. */
export const LOGO_BITMAP_WIDTH = LOGO_MAX_SIZE;

/** Line spacing between receipt rows (NYX API units). */
export const RECEIPT_LINE_SPACING = 2;

/** ESC/POS line spacing in dots (58 mm — balanced for 24px body). */
export const ESC_POS_LINE_SPACING = 28;
