package com.fuelreceipt.app.unifiedprinter

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.ReadableMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import woyou.aidlservice.jiuiv5.IWoyouService as Jiuiv5Service
import woyou.stu.sdkservice.clientinterface.IWoyouService as StuService

class SunmiPrinterBridge(private val context: Context) {
  private var jiuiv5Service: Jiuiv5Service? = null
  private var stuService: StuService? = null
  private var isConnected = false
  private val mainHandler = Handler(Looper.getMainLooper())
  private var connectLatch = CountDownLatch(1)

  private val serviceConnection =
    object : ServiceConnection {
      override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
        try {
          when (name?.packageName) {
            PACKAGE_STU -> stuService = StuService.Stub.asInterface(service)
            PACKAGE_JIUIV5 -> jiuiv5Service = Jiuiv5Service.Stub.asInterface(service)
            else -> {
              stuService = runCatching { StuService.Stub.asInterface(service) }.getOrNull()
              if (stuService == null) {
                jiuiv5Service = runCatching { Jiuiv5Service.Stub.asInterface(service) }.getOrNull()
              }
            }
          }
          isConnected = jiuiv5Service != null || stuService != null
          if (isConnected) {
            Log.d(TAG, "Sunmi printer connected via ${name?.flattenToShortString()}")
          }
        } catch (e: Exception) {
          Log.w(TAG, "Sunmi stub error: ${e.message}")
          isConnected = false
        } finally {
          connectLatch.countDown()
        }
      }

      override fun onServiceDisconnected(name: ComponentName?) {
        jiuiv5Service = null
        stuService = null
        isConnected = false
        connectLatch = CountDownLatch(1)
        mainHandler.postDelayed({ bindService() }, 5000)
      }
    }

  init {
    bindService()
  }

  fun bindService() {
    connectLatch = CountDownLatch(1)
    for (target in BIND_TARGETS) {
      val intent = Intent()
      intent.setPackage(target.packageName)
      intent.action = target.action
      try {
        val started = context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
        if (started) {
          Log.d(TAG, "Binding Sunmi service ${target.packageName}")
          return
        }
      } catch (e: Exception) {
        Log.w(TAG, "Sunmi bind failed for ${target.packageName}: ${e.message}")
      }
    }
    connectLatch.countDown()
  }

  fun waitForConnection(timeoutMs: Long = 8000): Boolean {
    if (isConnected()) return true
    bindService()
    connectLatch.await(timeoutMs, TimeUnit.MILLISECONDS)
    return isConnected()
  }

  fun isConnected(): Boolean = isConnected && (jiuiv5Service != null || stuService != null)

  fun initPrinter(): Boolean {
    // Bind only — never call printerInit/initPrinter (triggers device info self-print on V2s).
    return waitForConnection()
  }

  fun getPrinterStatus(): Int {
    if (!isConnected()) return 0
    // Never call updatePrinterState() — V2s firmware echoes POS-V2s / Version / Density to paper.
    return 1
  }

  /**
   * Sunmi AIDL must run on the main thread. RN invokes native modules from a pool thread.
   */
  private fun runOnMainSync(timeoutMs: Long = 15000, block: () -> Int): Int {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      return block()
    }
    val latch = CountDownLatch(1)
    var result = -1
    mainHandler.post {
      try {
        result = block()
      } catch (e: Exception) {
        Log.w(TAG, "Sunmi main-thread print error: ${e.message}")
        result = -1
      } finally {
        latch.countDown()
      }
    }
    latch.await(timeoutMs, TimeUnit.MILLISECONDS)
    return result
  }

  /** sendRAWData must be called directly — it does not flush from enterPrinterBuffer on V2s. */
  private fun sendRawBytes(bytes: ByteArray) {
    when {
      stuService != null -> stuService!!.sendRAWData(bytes, null)
      jiuiv5Service != null -> jiuiv5Service!!.sendRAWData(bytes, null)
      else -> throw IllegalStateException("Sunmi printer service not connected")
    }
  }

  private fun printBitmapDirect(bitmap: Bitmap) {
    when {
      stuService != null -> stuService!!.printBitmap(bitmap, null)
      jiuiv5Service != null -> jiuiv5Service!!.printBitmap(bitmap, null)
      else -> throw IllegalStateException("Sunmi printer service not connected")
    }
  }

  /**
   * Print logo (optional) + ESC/POS receipt.
   * Never use printText / setAlignment / lineWrap — they print diagnostics on V2s.
   */
  fun printReceiptBase64(logoBase64: String?, receiptBase64: String): Int {
    if (!waitForConnection()) return -1
    return runOnMainSync {
      try {
        val receiptBytes = Base64.decode(receiptBase64, Base64.DEFAULT)
        val logoBitmap = decodeLogoBitmap(logoBase64)

        logoBitmap?.let { bitmap ->
          printBitmapDirect(bitmap)
          sendRawBytes(byteArrayOf(0x0a, 0x0a))
          bitmap.recycle()
        }

        Log.d(TAG, "Sunmi sendRAWData receipt bytes=${receiptBytes.size}")
        sendRawBytes(receiptBytes)
        0
      } catch (e: Exception) {
        Log.w(TAG, "Sunmi receipt print error: ${e.message}")
        -1
      }
    }
  }

  fun printRawDataBase64(base64Data: String): Int {
    if (!waitForConnection()) return -1
    return runOnMainSync {
      try {
        val bytes = Base64.decode(base64Data, Base64.DEFAULT)
        Log.d(TAG, "Sunmi sendRAWData bytes=${bytes.size}")
        sendRawBytes(bytes)
        0
      } catch (e: Exception) {
        Log.w(TAG, "Sunmi raw print error: ${e.message}")
        -1
      }
    }
  }

  /**
   * NYX compatibility — Sunmi V2s must not use AIDL printText (prints device diagnostics).
   */
  fun printText(content: String, textFormat: ReadableMap): Int {
    Log.w(TAG, "printText redirected to raw ESC/POS on Sunmi")
    return printTextAsRawEscPos(content, textFormat)
  }

  private fun printTextAsRawEscPos(content: String, textFormat: ReadableMap): Int {
    if (!waitForConnection()) return -1
    return runOnMainSync {
      try {
        val align = textFormat.getInt("align").coerceIn(0, 2)
        val bold = textFormat.getInt("style") == 1
        val text = if (content.endsWith("\n")) content else "$content\n"

        val parts = ArrayList<Byte>()
        parts.add(0x1b.toByte())
        parts.add(0x40.toByte())
        parts.add(0x1b.toByte())
        parts.add(0x61.toByte())
        parts.add(align.toByte())
        if (bold) {
          parts.add(0x1b.toByte())
          parts.add(0x45.toByte())
          parts.add(0x01.toByte())
        }
        for (ch in text) {
          val code = ch.code
          if (code in 0..255) parts.add(code.toByte())
        }
        if (bold) {
          parts.add(0x1b.toByte())
          parts.add(0x45.toByte())
          parts.add(0x00.toByte())
        }

        sendRawBytes(parts.toByteArray())
        0
      } catch (e: Exception) {
        Log.w(TAG, "Sunmi raw text print error: ${e.message}")
        -1
      }
    }
  }

  fun printBitmapBase64(base64Data: String, @Suppress("UNUSED_PARAMETER") align: Int): Int {
    if (!waitForConnection()) return -1
    return runOnMainSync {
      try {
        val bitmap = decodeLogoBitmap(base64Data) ?: return@runOnMainSync -2
        printBitmapDirect(bitmap)
        sendRawBytes(byteArrayOf(0x0a))
        bitmap.recycle()
        0
      } catch (e: Exception) {
        Log.w(TAG, "Sunmi bitmap error: ${e.message}")
        -1
      }
    }
  }

  fun paperOut(lines: Int): Int {
    if (lines <= 0) return 0
    val feed = lines.coerceIn(1, 255).toByte()
    return printRawDataBase64(Base64.encodeToString(byteArrayOf(0x1b, 0x64, feed), Base64.NO_WRAP))
  }

  fun cutPaper(): Boolean {
    if (!isConnected()) return false
    return printRawDataBase64(Base64.encodeToString(byteArrayOf(0x1d, 0x56, 0x00), Base64.NO_WRAP)) == 0
  }

  private fun decodeLogoBitmap(base64Data: String?): Bitmap? {
    if (base64Data.isNullOrBlank()) return null
    val decodedBytes = Base64.decode(base64Data, Base64.DEFAULT)
    val decoded = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size) ?: return null
    return BitmapScaler.scaleForReceipt(decoded)
  }

  private data class BindTarget(val packageName: String, val action: String)

  companion object {
    private const val TAG = "SunmiPrinterBridge"
    private const val PACKAGE_JIUIV5 = "woyou.aidlservice.jiuiv5"
    private const val PACKAGE_STU = "woyou.stu.sdkservice"

    private val BIND_TARGETS =
      listOf(
        BindTarget(PACKAGE_STU, "woyou.stu.sdkservice.sdkservice"),
        BindTarget(PACKAGE_JIUIV5, "woyou.aidlservice.jiuiv5.IWoyouService"),
      )
  }
}
