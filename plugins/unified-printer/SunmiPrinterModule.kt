package com.fuelreceipt.app.unifiedprinter

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.math.ceil

class SunmiPrinterModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val engine = SunmiPrinterEngine.getInstance(reactContext)

  override fun getName(): String = "SunmiPrinterModule"

  override fun initialize() {
    super.initialize()
    engine.setStatusEmitter { status ->
      try {
        reactApplicationContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("SunmiPrinterStatus", status)
      } catch (_: Exception) {
        // Bridge not ready yet — ignore
      }
    }
    engine.connect(reactApplicationContext)
  }

  /** Required for NativeEventEmitter subscription on Android. */
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  @ReactMethod
  fun initPrinter(promise: Promise) {
    promise.resolve(engine.ensureReady())
  }

  /** Check IWoyouService directly — never rely on a stale cached flag alone. */
  @ReactMethod
  fun isConnected(promise: Promise) {
    if (engine.isConnected()) {
      promise.resolve(true)
      return
    }
    Thread {
      promise.resolve(engine.waitForConnection(8000))
    }.start()
  }

  @ReactMethod
  fun getPrinterStatus(promise: Promise) {
    Thread {
      val ok = engine.waitForConnection(5000)
      promise.resolve(if (ok) "NORMAL" else "DISCONNECTED")
    }.start()
  }

  @ReactMethod
  fun printReceipt(
    logoBase64: String,
    storeName: String,
    address: String,
    dateTime: String,
    product: String,
    volume: String,
    rate: String,
    total: String,
    vehicleNo: String,
    promise: Promise,
  ) {
    Thread {
      try {
        if (!waitForService(8000)) {
          promise.reject(
            "NOT_CONNECTED",
            "Sunmi printer service not connected after retry",
          )
          return@Thread
        }

        engine.printReceipt(
          logoBase64.ifBlank { null },
          storeName,
          address,
          dateTime,
          product,
          volume,
          rate,
          total,
          vehicleNo,
        )
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("PRINT_FAILED", e.message, e)
      }
    }.start()
  }

  @ReactMethod
  fun printTestLine(promise: Promise) {
    Thread {
      try {
        if (!waitForService(8000)) {
          promise.reject("NOT_CONNECTED", "Sunmi printer service not connected after retry")
          return@Thread
        }
        engine.printTestLine()
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("TEST_FAILED", e.message, e)
      }
    }.start()
  }

  /** High-level AIDL test: printText + lineWrap (no setAlignment). */
  @ReactMethod
  fun printHelloWorld(promise: Promise) {
    Thread {
      try {
        if (!waitForService(8000)) {
          promise.reject("NOT_CONNECTED", "Sunmi printer service not connected after retry")
          return@Thread
        }
        engine.printHelloWorld()
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("HELLO_FAILED", e.message, e)
      }
    }.start()
  }

  /**
   * VSTC: decode PNG → 1-bit GS v 0 raster bytes for Bluetooth sendRAWData.
   * Returns base64 ESC/POS payload (ESC @ + GS v 0 image + feed).
   */
  @ReactMethod
  fun bitmapToEscPos(base64: String, targetWidthDots: Int, promise: Promise) {
    Thread {
      try {
        val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
        val bitmap =
          android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)

        if (bitmap == null) {
          promise.reject("ERR", "Cannot decode image")
          return@Thread
        }

        val scale = targetWidthDots.toFloat() / bitmap.width.coerceAtLeast(1)
        val targetHeight = (bitmap.height * scale).toInt().coerceAtLeast(1)

        val scaled =
          android.graphics.Bitmap.createScaledBitmap(
            bitmap,
            targetWidthDots,
            targetHeight,
            true,
          )

        val widthBytes = ceil(targetWidthDots / 8.0).toInt()
        val output = java.io.ByteArrayOutputStream()

        output.write(byteArrayOf(0x1B, 0x40))
        output.write(
          byteArrayOf(
            0x1D,
            0x76,
            0x30,
            0x00,
            (widthBytes and 0xFF).toByte(),
            ((widthBytes shr 8) and 0xFF).toByte(),
            (targetHeight and 0xFF).toByte(),
            ((targetHeight shr 8) and 0xFF).toByte(),
          )
        )

        for (y in 0 until targetHeight) {
          for (xByte in 0 until widthBytes) {
            var byteVal = 0
            for (bit in 0 until 8) {
              val x = xByte * 8 + bit
              if (x < targetWidthDots) {
                val pixel = scaled.getPixel(x, y)
                val r = (pixel shr 16) and 0xFF
                val g = (pixel shr 8) and 0xFF
                val b = pixel and 0xFF
                val gray = (0.299 * r + 0.587 * g + 0.114 * b).toInt()
                if (gray < 128) {
                  byteVal = byteVal or (0x80 shr bit)
                }
              }
            }
            output.write(byteVal)
          }
        }

        output.write(byteArrayOf(0x1B, 0x64, 0x01))

        val result =
          android.util.Base64.encodeToString(
            output.toByteArray(),
            android.util.Base64.NO_WRAP,
          )

        Log.d(
          TAG,
          "bitmapToEscPos: ${targetWidthDots}x$targetHeight dots, ${output.size()} bytes",
        )
        promise.resolve(result)
      } catch (e: Exception) {
        Log.e(TAG, "bitmapToEscPos failed: ${e.message}")
        promise.reject("ERR", e.message)
      }
    }.start()
  }

  /** VSTC logo: decode base64 PNG and print via jiuiv5 printBitmap (no setAlignment). */
  @ReactMethod
  fun printBitmapBase64(base64: String, promise: Promise) {
    Thread {
      try {
        if (!waitForService(8000)) {
          promise.reject("NOT_CONNECTED", "Sunmi printer service not connected after retry")
          return@Thread
        }
        engine.printBitmapBase64(base64)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("PRINT_BITMAP_FAILED", e.message, e)
      }
    }.start()
  }

  /** Diagnostic: sendRAWData only (no buffer) — confirm jiuiv5 outputs raw ESC/POS. */
  @ReactMethod
  fun printHelloWorldRaw(promise: Promise) {
    Thread {
      try {
        if (!waitForService(8000)) {
          promise.reject("NOT_CONNECTED", "Sunmi printer service not connected after retry")
          return@Thread
        }
        engine.printHelloWorldDirectRaw()
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("HELLO_RAW_FAILED", e.message, e)
      }
    }.start()
  }

  /** Rebind and poll every 100ms for up to [timeoutMs]. */
  private fun waitForService(timeoutMs: Long): Boolean {
    if (engine.isConnected()) return true

    engine.bindService()
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      if (engine.isConnected()) return true
      try {
        Thread.sleep(100)
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        break
      }
    }
    return engine.isConnected()
  }

  companion object {
    private const val TAG = "SunmiPrinterModule"
  }
}
