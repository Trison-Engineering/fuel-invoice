/**
 * Sunmi handheld built-in printer (NYX) — 2-inch (50.8 mm) thermal roll.
 * SpeedX / 58 mm samples use ~32 chars; scale down for narrower paper.
 */
export const PAPER_WIDTH_INCHES = 2;
export const PAPER_WIDTH_MM = 50.8;

/** Reference width used on 58 mm printers (e.g. SpeedX). */
const REFERENCE_PAPER_MM = 58;
const REFERENCE_LINE_CHARS = 32;

/** Monospace characters that fit one line on 2" Sunmi paper (body font). */
export const RECEIPT_LINE_WIDTH = Math.max(
  22,
  Math.round(REFERENCE_LINE_CHARS * (PAPER_WIDTH_MM / REFERENCE_PAPER_MM))
);

/** Max logo width and height in dots when printing on thermal paper. */
export const LOGO_MAX_SIZE = 100;

/** @deprecated Use LOGO_MAX_SIZE — kept for existing imports. */
export const LOGO_BITMAP_WIDTH = LOGO_MAX_SIZE;

/** Text sizes (px) for NYX high-level print API — compact layout. */
export const RECEIPT_FONT = {
  body: 14,
  heading: 15,
  storeName: 16,
  total: 15,
} as const;

/** NYX / preview line spacing multiplier — lower = tighter rows. */
export const RECEIPT_LINE_SPACING = 0;
