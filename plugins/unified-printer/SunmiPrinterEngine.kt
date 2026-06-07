package com.fuelreceipt.app.unifiedprinter

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.Log
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import woyou.aidlservice.jiuiv5.IWoyouService as LegacyIWoyouService
import woyou.stu.sdkservice.clientinterface.IWoyouService

/**
 * Production Sunmi V2s_GL printer engine.
 *
 * NEVER call: initPrinter(), printerSelfChecking(), updatePrinterState(),
 * getPrinterModal(), getPrinterSerialNo(), getPrinterThermistorTemp().
 */
class SunmiPrinterEngine private constructor(context: Context) {
  private val appContext = context.applicationContext
  private val mainHandler = Handler(Looper.getMainLooper())
  private var printApi: SunmiPrintApi? = null
  private var connectLatch = CountDownLatch(1)
  private var pendingLegacy = false

  private val connection =
    object : ServiceConnection {
      override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
        printApi =
          try {
            if (pendingLegacy) {
              LegacySunmiPrintApi(LegacyIWoyouService.Stub.asInterface(service))
            } else {
              StuSunmiPrintApi(IWoyouService.Stub.asInterface(service))
            }
          } catch (e: Exception) {
            Log.e(TAG, "Service stub error: ${e.message}")
            null
          }
        Log.d(TAG, "Sunmi service connected: ${name?.flattenToShortString()}")
        Log.d(TAG, "printerService is: ${if (printApi != null) "NOT NULL" else "NULL"}")
        connectLatch.countDown()
      }

      override fun onServiceDisconnected(name: ComponentName?) {
        printApi = null
        connectLatch = CountDownLatch(1)
        Log.w(TAG, "Sunmi service disconnected, retrying in 3s")
        mainHandler.postDelayed({ bindService() }, 3000)
      }
    }

  init {
    bindService()
  }

  fun bindService() {
    if (isConnected()) {
      Log.d(TAG, "Already connected, skip bind")
      return
    }

    connectLatch = CountDownLatch(1)

    for (target in BIND_TARGETS) {
      pendingLegacy = target.legacy
      try {
        val intent = Intent()
        intent.setPackage(target.packageName)
        intent.action = target.action
        val bound = appContext.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        Log.d(TAG, "bindService ${target.packageName} result: $bound")
        if (!bound) continue

        connectLatch.await(6000, TimeUnit.MILLISECONDS)
        if (isConnected()) {
          Log.d(TAG, "Bound via ${target.packageName}")
          return
        }

        try {
          appContext.unbindService(connection)
        } catch (_: Exception) {
        }
        printApi = null
        connectLatch = CountDownLatch(1)
      } catch (e: Exception) {
        Log.e(TAG, "bindService error (${target.packageName}): ${e.message}")
      }
    }

    connectLatch.countDown()
    Log.w(TAG, "All Sunmi bind attempts failed")
  }

  fun waitForConnection(timeoutMs: Long = 10000): Boolean {
    if (isConnected()) return true
    bindService()
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      if (isConnected()) return true
      try {
        Thread.sleep(100)
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        break
      }
    }
    return isConnected()
  }

  fun isConnected(): Boolean = printApi != null

  fun ensureReady(): Boolean = waitForConnection()

  fun getStatusCode(): Int = if (isConnected()) 1 else 0

  fun printReceipt(
    logoBase64: String?,
    storeName: String,
    address: String,
    receiptNo: String,
    date: String,
    time: String,
    payment: String,
    product: String,
    volume: String,
    rate: String,
    total: String,
    vehicleNo: String,
  ) {
    val api = printApi ?: throw IllegalStateException("Sunmi printer service not connected")

    Log.d(TAG, "Starting receipt print...")

    if (!logoBase64.isNullOrBlank()) {
      try {
        val logo = processLogoForPrinting(logoBase64)
        if (logo != null) {
          api.setAlignment(1)
          api.printBitmap(logo)
          logo.recycle()
          api.lineWrap(1)
        }
      } catch (logoErr: Exception) {
        Log.e(TAG, "Logo print failed, skipping: ${logoErr.message}")
      }
    }

    val boldOn = byteArrayOf(0x1B, 0x45, 0x01)
    val boldOff = byteArrayOf(0x1B, 0x45, 0x00)

    api.setAlignment(1)
    api.sendRAWData(boldOn)
    val storeFontSize =
      when {
        storeName.length <= 14 -> 40f
        storeName.length <= 18 -> 32f
        storeName.length <= 24 -> 28f
        else -> 24f
      }
    api.setFontSize(storeFontSize)
    safePrint(api, storeName.uppercase())

    api.sendRAWData(boldOff)
    api.setFontSize(24f)

    api.setAlignment(1)
    printAddressWrapped(api, address)

    api.setAlignment(1)
    api.sendRAWData(boldOn)
    safePrint(api, "FUEL RECEIPT")
    api.sendRAWData(boldOff)

    api.setAlignment(0)
    safePrint(api, DIVIDER)

    safePrint(api, formatRow("RECEIPT NO:", receiptNo))
    safePrint(api, formatRow("DATE:", date))
    safePrint(api, formatRow("TIME:", time))
    safePrint(api, formatRow("PAYMENT:", payment.uppercase()))

    safePrint(api, DIVIDER)

    safePrint(api, formatRow("PRODUCT:", product.uppercase()))
    safePrint(api, formatRow("VOLUME:", "${volume.uppercase()} LTR"))
    safePrint(api, formatRow("RATE/LTR:", "Rs. $rate"))

    safePrint(api, DIVIDER)

    api.sendRAWData(boldOn)
    safePrint(api, formatRow("TOTAL AMOUNT:", "Rs. $total"))
    api.sendRAWData(boldOff)

    safePrint(api, DIVIDER)

    if (vehicleNo.isNotBlank()) {
      safePrint(api, formatRow("VEHICLE NO:", vehicleNo.uppercase()))
      safePrint(api, DIVIDER)
    }

    api.setAlignment(1)
    safePrint(api, centerText("POWERED BY TRISON"))

    api.lineWrap(5)
    Log.d(TAG, "Receipt print completed successfully")
  }

  fun printTestLine() {
    val api = printApi ?: throw IllegalStateException("Not connected")
    api.setAlignment(1)
    api.printText("Printer Connected OK\n")
    api.lineWrap(3)
  }

  private interface SunmiPrintApi {
    fun setAlignment(alignment: Int)

    fun setFontSize(fontSize: Float)

    fun sendRAWData(data: ByteArray)

    fun printText(text: String)

    fun printBitmap(bitmap: Bitmap)

    fun lineWrap(n: Int)
  }

  private class StuSunmiPrintApi(private val service: IWoyouService) : SunmiPrintApi {
    override fun setAlignment(alignment: Int) {
      service.setAlignment(alignment, null)
    }

    override fun setFontSize(fontSize: Float) {
      service.setFontSize(fontSize, null)
    }

    override fun sendRAWData(data: ByteArray) {
      service.sendRAWData(data, null)
    }

    override fun printText(text: String) {
      service.printText(text, null)
    }

    override fun printBitmap(bitmap: Bitmap) {
      service.printBitmap(bitmap, null)
    }

    override fun lineWrap(n: Int) {
      service.lineWrap(n, null)
    }
  }

  private class LegacySunmiPrintApi(private val service: LegacyIWoyouService) : SunmiPrintApi {
    override fun setAlignment(alignment: Int) {
      service.setAlignment(alignment, null)
    }

    override fun setFontSize(fontSize: Float) {
      service.setFontSize(fontSize, null)
    }

    override fun sendRAWData(data: ByteArray) {
      service.sendRAWData(data, null)
    }

    override fun printText(text: String) {
      service.printText(text, null)
    }

    override fun printBitmap(bitmap: Bitmap) {
      service.printBitmap(bitmap, null)
    }

    override fun lineWrap(n: Int) {
      service.lineWrap(n, null)
    }
  }

  private data class BindTarget(
    val packageName: String,
    val action: String,
    val legacy: Boolean,
  )

  private fun safePrint(api: SunmiPrintApi, text: String) {
    val line = if (text.endsWith("\n")) text else "$text\n"
    api.printText(line)
  }

  private fun formatRow(label: String, value: String): String {
    val totalLen = label.length + value.length
    if (totalLen >= LINE_WIDTH) {
      val maxLabel = (LINE_WIDTH - value.length - 1).coerceAtLeast(1)
      return label.substring(0, minOf(maxLabel, label.length)) + " " + value
    }
    val spaces = LINE_WIDTH - totalLen
    return label + " ".repeat(spaces) + value
  }

  private fun centerText(text: String): String {
    if (text.length >= LINE_WIDTH) return text
    val spaces = (LINE_WIDTH - text.length) / 2
    return " ".repeat(spaces) + text
  }

  private fun printAddressWrapped(api: SunmiPrintApi, address: String) {
    if (address.isBlank()) return
    val words = address.trim().split("\\s+".toRegex())
    val line = StringBuilder()
    for (word in words) {
      val candidate = if (line.isEmpty()) word else "${line} $word"
      if (candidate.length <= LINE_WIDTH) {
        line.clear()
        line.append(candidate)
      } else {
        if (line.isNotEmpty()) {
          safePrint(api, line.toString())
          line.clear()
        }
        line.append(word)
      }
    }
    if (line.isNotEmpty()) {
      safePrint(api, line.toString())
    }
  }

  private fun processLogoForPrinting(base64Data: String): Bitmap? {
    return try {
      val bytes = Base64.decode(base64Data, Base64.DEFAULT)
      val original = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null

      val maxWidth = 384
      val maxHeight = 200
      val scaleW = maxWidth.toFloat() / original.width
      val scaleH = maxHeight.toFloat() / original.height
      val scale = minOf(scaleW, scaleH)
      val newW = (original.width * scale).toInt().coerceAtLeast(1)
      val newH = (original.height * scale).toInt().coerceAtLeast(1)

      val scaled = Bitmap.createScaledBitmap(original, newW, newH, true)
      if (scaled != original) original.recycle()

      val result = Bitmap.createBitmap(384, newH, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(result)
      canvas.drawColor(Color.WHITE)

      val paint = Paint()
      val cm = ColorMatrix()
      cm.setSaturation(0f)
      paint.colorFilter = ColorMatrixColorFilter(cm)

      val left = (384 - newW) / 2f
      canvas.drawBitmap(scaled, left, 0f, paint)
      scaled.recycle()
      result
    } catch (e: Exception) {
      Log.e(TAG, "Logo processing error: ${e.message}")
      null
    }
  }

  companion object {
    private const val TAG = "SunmiPrinter"
    private const val LINE_WIDTH = 32
    private const val DIVIDER = "--------------------------------"

    private val BIND_TARGETS =
      listOf(
        BindTarget("woyou.stu.sdkservice", "woyou.stu.sdkservice.sdkservice", false),
        BindTarget("woyou.aidlservice.jiuiv5", "woyou.aidlservice.jiuiv5.IWoyouService", true),
      )

    @Volatile
    private var instance: SunmiPrinterEngine? = null

    fun getInstance(context: Context): SunmiPrinterEngine {
      return instance ?: synchronized(this) {
        instance ?: SunmiPrinterEngine(context.applicationContext).also { instance = it }
      }
    }
  }
}
