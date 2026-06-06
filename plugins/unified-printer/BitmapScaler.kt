package com.fuelreceipt.app.unifiedprinter

import android.graphics.Bitmap

object BitmapScaler {
  const val MAX_LOGO_SIZE = 100

  /** Scale bitmap to fit within maxSize x maxSize, preserving aspect ratio. */
  fun scaleToMax(bitmap: Bitmap, maxSize: Int = MAX_LOGO_SIZE): Bitmap {
    val width = bitmap.width
    val height = bitmap.height
    if (width <= maxSize && height <= maxSize) {
      return bitmap
    }

    val scale = minOf(maxSize.toFloat() / width, maxSize.toFloat() / height)
    val targetWidth = (width * scale).toInt().coerceAtLeast(1)
    val targetHeight = (height * scale).toInt().coerceAtLeast(1)
    return Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true)
  }
}
