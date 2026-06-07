package com.fuelreceipt.app.unifiedprinter

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color

object BitmapScaler {
  const val PAPER_WIDTH = 384
  const val MAX_LOGO_HEIGHT = 150

  /**
   * Scale logo for 58 mm thermal paper: fit within 384×150 dots,
   * bilinear filter, centered on a 384px-wide white canvas.
   */
  fun scaleForReceipt(original: Bitmap): Bitmap {
    val origWidth = original.width
    val origHeight = original.height
    if (origWidth <= 0 || origHeight <= 0) return original

    val scaleW = PAPER_WIDTH.toFloat() / origWidth
    val scaleH = MAX_LOGO_HEIGHT.toFloat() / origHeight
    val scale = minOf(scaleW, scaleH)

    val newWidth = (origWidth * scale).toInt().coerceAtLeast(1)
    val newHeight = (origHeight * scale).toInt().coerceAtLeast(1)

    val scaled =
      if (newWidth == origWidth && newHeight == origHeight) {
        original
      } else {
        Bitmap.createScaledBitmap(original, newWidth, newHeight, true)
      }

    if (newWidth >= PAPER_WIDTH && scaled !== original) {
      return scaled
    }

    val centered = Bitmap.createBitmap(PAPER_WIDTH, newHeight, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(centered)
    canvas.drawColor(Color.WHITE)
    val left = (PAPER_WIDTH - newWidth) / 2f
    canvas.drawBitmap(scaled, left, 0f, null)

    if (scaled !== original) {
      scaled.recycle()
    }

    return centered
  }

  /** @deprecated Use scaleForReceipt — kept for call-site compatibility. */
  fun scaleToMax(bitmap: Bitmap, maxSize: Int = MAX_LOGO_HEIGHT): Bitmap = scaleForReceipt(bitmap)
}
