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

/** Logo bitmap target width in dots (~2" printable area). */
export const LOGO_BITMAP_WIDTH = Math.round(384 * (PAPER_WIDTH_MM / REFERENCE_PAPER_MM));

/** NYX textSize values tuned for 2" paper. */
export const RECEIPT_FONT = {
  body: 18,
  heading: 20,
  storeName: 22,
  total: 20,
} as const;
