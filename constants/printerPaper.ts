/**
 * Sunmi V2s — 58 mm thermal roll (384-dot printable width).
 *
 * Characters per line (device spec):
 *   24px → 32 chars
 *   28px → 26 chars
 *   32px → 22 chars
 *   40px → 18 chars
 *   48px → 14 chars
 */
export const PAPER_WIDTH_MM = 58;
export const PAPER_WIDTH_INCHES = Math.round((PAPER_WIDTH_MM / 25.4) * 10) / 10;

/** Printable bitmap width in dots (58 mm paper). */
export const SUNMI_BITMAP_WIDTH = 384;

/** Paper roll outer diameter (mm). */
export const PAPER_ROLL_DIAMETER_MM = 40;

/** Chars per line at each font tier. */
export const SUNMI_CHARS_PER_LINE = {
  xsmall: 32,
  small: 26,
  normal: 22,
  large: 18,
  xlarge: 14,
} as const;

/** Sunmi textSize values for receipt body and headings. */
export const RECEIPT_FONT = {
  body: 24,
  heading: 24,
  storeName: 32,
  total: 24,
} as const;

/** Resolve monospace chars that fit one line for a given font size (px). */
export function charsPerLineForFontSize(fontSize: number): number {
  if (fontSize >= 48) return SUNMI_CHARS_PER_LINE.xlarge;
  if (fontSize >= 40) return SUNMI_CHARS_PER_LINE.large;
  if (fontSize >= 32) return SUNMI_CHARS_PER_LINE.normal;
  if (fontSize >= 28) return SUNMI_CHARS_PER_LINE.small;
  return SUNMI_CHARS_PER_LINE.xsmall;
}

/** Body row width at 24px on 58 mm paper. */
export const RECEIPT_LINE_WIDTH = SUNMI_CHARS_PER_LINE.xsmall;

/** @deprecated Use RECEIPT_LINE_WIDTH — header wrap is now dynamic per font size. */
export const RECEIPT_HEADER_LINE_WIDTH = SUNMI_CHARS_PER_LINE.normal;

/** Logo display size in receipt preview (screen px). */
export const LOGO_PREVIEW_SIZE = 80;

/** Max logo width on thermal paper (dots). */
export const LOGO_BITMAP_WIDTH = SUNMI_BITMAP_WIDTH;

/** Max logo height on thermal paper (dots). */
export const LOGO_MAX_HEIGHT = 150;

/** @deprecated Use LOGO_MAX_HEIGHT — kept for existing imports. */
export const LOGO_MAX_SIZE = LOGO_MAX_HEIGHT;

/** Pick printer font size so the store name fits on one line when possible. */
export function getStoreFontSize(name: string): number {
  const length = name.trim().length;
  if (length <= 14) return 48;
  if (length <= 18) return 40;
  if (length <= 22) return 32;
  if (length <= 26) return 28;
  if (length <= 32) return 24;
  return 24;
}

/** Preview screen font size scaled for mobile display. */
export function getPreviewStoreFontSize(name: string): number {
  const length = name.trim().length;
  if (length <= 14) return 18;
  if (length <= 18) return 16;
  if (length <= 22) return 14;
  if (length <= 26) return 13;
  return 12;
}

/** Line spacing between receipt rows (Sunmi API units). */
export const RECEIPT_LINE_SPACING = 2;

/** ESC/POS line spacing in dots (58 mm — balanced for 24px body). */
export const ESC_POS_LINE_SPACING = 28;
