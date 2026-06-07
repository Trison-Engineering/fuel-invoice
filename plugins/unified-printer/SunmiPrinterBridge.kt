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

/**
 * Sunmi V2s prints reliably via AIDL printTextWithFont line-by-line.
 * Bulk ESC/POS sendRAWData accepts the call but often does not output on V2s firmware.
 */
class SunmiPrinterBridge(private val context: Context) {
  private var jiuiv5Service: Jiuiv5Service? = null
  private var stuService: StuService? = null
  private var isConnected = false
  private var connectLatch = CountDownLatch(1)
  private val mainHandler = Handler(Looper.getMainLooper())

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
            Log.d(TAG, "Connected via ${name?.flattenToShortString()} active=${activeServiceName()}")
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
        Log.w(TAG, "Sunmi main-thread error: ${e.message}")
        result = -1
      } finally {
        latch.countDown()
      }
    }
    latch.await(timeoutMs, TimeUnit.MILLISECONDS)
    return result
  }

  private fun activeServiceName(): String =
    when {
      stuService != null -> PACKAGE_STU
      jiuiv5Service != null -> PACKAGE_JIUIV5
      else -> "none"
    }

  fun initPrinter(): Boolean {
    if (!waitForConnection()) return false
    return runOnMainSync {
      try {
        when {
          stuService != null -> stuService!!.initPrinter()
          jiuiv5Service != null -> jiuiv5Service!!.printerInit()
          else -> return@runOnMainSync -1
        }
        Log.d(TAG, "initPrinter ok on ${activeServiceName()}")
        0
      } catch (e: Exception) {
        Log.w(TAG, "initPrinter error: ${e.message}")
        -1
      }
    } == 0
  }

  fun getPrinterStatus(): Int {
    if (!isConnected()) return 0
    return 1
  }

  fun printText(content: String, textFormat: ReadableMap): Int {
    if (!waitForConnection()) return -1
    return runOnMainSync {
      try {
        val align = textFormat.getInt("align")
        val fontSize = textFormat.getInt("textSize").toFloat()
        val bold = textFormat.getInt("style") == 1
        val line = if (content.endsWith("\n")) content else "$content\n"

        when {
          stuService != null -> {
            stuService!!.setAlignment(align, null)
            if (bold) {
              stuService!!.sendRAWData(buildBoldTextCommand(line), null)
            } else {
              stuService!!.printTextWithFont(line, "monospace", fontSize, null)
            }
          }
          jiuiv5Service != null -> {
            jiuiv5Service!!.setAlignment(align, null)
            if (bold) {
              jiuiv5Service!!.sendRAWData(buildBoldTextCommand(line), null)
            } else {
              jiuiv5Service!!.printTextWithFont(line, "monospace", fontSize, null)
            }
          }
          else -> return@runOnMainSync -1
        }
        0
      } catch (e: Exception) {
        Log.w(TAG, "printText error: ${e.message}")
        -1
      }
    }
  }

  fun printBitmapBase64(base64Data: String, align: Int): Int {
    if (!waitForConnection()) return -1
    return runOnMainSync {
      try {
        val decodedBytes = Base64.decode(base64Data, Base64.DEFAULT)
        val decoded = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
          ?: return@runOnMainSync -2
        val bitmap = BitmapScaler.scaleForReceipt(decoded)

        when {
          stuService != null -> {
            stuService!!.setAlignment(align, null)
            stuService!!.printBitmap(bitmap, null)
          }
          jiuiv5Service != null -> {
            jiuiv5Service!!.setAlignment(align, null)
            jiuiv5Service!!.printBitmap(bitmap, null)
          }
          else -> return@runOnMainSync -1
        }
        bitmap.recycle()
        0
      } catch (e: Exception) {
        Log.w(TAG, "printBitmap error: ${e.message}")
        -1
      }
    }
  }

  fun printRawDataBase64(base64Data: String): Int {
    if (!waitForConnection()) return -1
    return runOnMainSync {
      try {
        val bytes = Base64.decode(base64Data, Base64.DEFAULT)
        when {
          stuService != null -> stuService!!.sendRAWData(bytes, null)
          jiuiv5Service != null -> jiuiv5Service!!.sendRAWData(bytes, null)
          else -> return@runOnMainSync -1
        }
        0
      } catch (e: Exception) {
        Log.w(TAG, "sendRAWData error: ${e.message}")
        -1
      }
    }
  }

  /** Kept for API compat — delegates to printRawDataBase64 (logo + raw rarely works on V2s). */
  fun printReceiptBase64(logoBase64: String?, receiptBase64: String): Int {
    if (!waitForConnection()) return -1
    return runOnMainSync {
      try {
        decodeLogoBitmap(logoBase64)?.let { bitmap ->
          printBitmapDirect(bitmap)
          sendNewlines(2)
          bitmap.recycle()
        }
        val receiptBytes = Base64.decode(receiptBase64, Base64.DEFAULT)
        when {
          stuService != null -> stuService!!.sendRAWData(receiptBytes, null)
          jiuiv5Service != null -> jiuiv5Service!!.sendRAWData(receiptBytes, null)
          else -> return@runOnMainSync -1
        }
        paperOutInternal(4)
        0
      } catch (e: Exception) {
        Log.w(TAG, "printReceiptBase64 error: ${e.message}")
        -1
      }
    }
  }

  fun printDiagnostic(): Int {
    if (!waitForConnection()) return -1
    return runOnMainSync {
      try {
        initPrinterInternal()
        when {
          stuService != null -> {
            stuService!!.setAlignment(1, null)
            stuService!!.printText("=== DIAGNOSTIC TEST ===\n", null)
            stuService!!.printText("Sunmi V2s Printer\n", null)
            stuService!!.printText("Status: Working\n", null)
            stuService!!.printText("=======================\n", null)
            stuService!!.lineWrap(5, null)
          }
          jiuiv5Service != null -> {
            jiuiv5Service!!.setAlignment(1, null)
            jiuiv5Service!!.printText("=== DIAGNOSTIC TEST ===\n", null)
            jiuiv5Service!!.printText("Sunmi V2s Printer\n", null)
            jiuiv5Service!!.printText("Status: Working\n", null)
            jiuiv5Service!!.printText("=======================\n", null)
            jiuiv5Service!!.lineWrap(5, null)
          }
          else -> return@runOnMainSync -1
        }
        0
      } catch (e: Exception) {
        Log.w(TAG, "printDiagnostic error: ${e.message}")
        -1
      }
    }
  }

  fun paperOut(lines: Int): Int {
    if (lines <= 0) return 0
    if (!waitForConnection()) return -1
    return runOnMainSync {
      paperOutInternal(lines.coerceIn(1, 255))
    }
  }

  fun cutPaper(): Boolean {
    if (!isConnected()) return false
    return runOnMainSync {
      try {
        when {
          stuService != null -> stuService!!.cutPaper(null)
          jiuiv5Service != null -> jiuiv5Service!!.cutPaper(null)
          else -> return@runOnMainSync -1
        }
        0
      } catch (e: Exception) {
        -1
      }
    } == 0
  }

  private fun initPrinterInternal() {
    when {
      stuService != null -> stuService!!.initPrinter()
      jiuiv5Service != null -> jiuiv5Service!!.printerInit()
    }
  }

  private fun paperOutInternal(lines: Int): Int {
    return try {
      when {
        stuService != null -> stuService!!.lineWrap(lines, null)
        jiuiv5Service != null -> jiuiv5Service!!.lineWrap(lines, null)
        else -> return -1
      }
      0
    } catch (e: Exception) {
      Log.w(TAG, "lineWrap error: ${e.message}")
      -1
    }
  }

  private fun printBitmapDirect(bitmap: Bitmap) {
    when {
      stuService != null -> stuService!!.printBitmap(bitmap, null)
      jiuiv5Service != null -> jiuiv5Service!!.printBitmap(bitmap, null)
      else -> throw IllegalStateException("Sunmi printer service not connected")
    }
  }

  private fun sendNewlines(count: Int) {
    val bytes = ByteArray(count) { 0x0a }
    when {
      stuService != null -> stuService!!.sendRAWData(bytes, null)
      jiuiv5Service != null -> jiuiv5Service!!.sendRAWData(bytes, null)
    }
  }

  private fun decodeLogoBitmap(base64Data: String?): Bitmap? {
    if (base64Data.isNullOrBlank()) return null
    val decodedBytes = Base64.decode(base64Data, Base64.DEFAULT)
    val decoded = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size) ?: return null
    return BitmapScaler.scaleForReceipt(decoded)
  }

  private fun buildBoldTextCommand(text: String): ByteArray {
    val boldOn = byteArrayOf(0x1B, 0x45, 0x01)
    val boldOff = byteArrayOf(0x1B, 0x45, 0x00)
    val textBytes = text.toByteArray(Charsets.UTF_8)
    return boldOn + textBytes + boldOff
  }

  private data class BindTarget(val packageName: String, val action: String)

  companion object {
    private const val TAG = "SunmiPrinter"
    private const val PACKAGE_JIUIV5 = "woyou.aidlservice.jiuiv5"
    private const val PACKAGE_STU = "woyou.stu.sdkservice"

    private val BIND_TARGETS =
      listOf(
        BindTarget(PACKAGE_STU, "woyou.stu.sdkservice.sdkservice"),
        BindTarget(PACKAGE_JIUIV5, "woyou.aidlservice.jiuiv5.IWoyouService"),
      )
  }
}
