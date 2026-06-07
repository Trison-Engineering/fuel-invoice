package com.fuelreceipt.app.unifiedprinter

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.IBinder
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.ReadableMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import woyou.aidlservice.jiuiv5.IWoyouService as Jiuiv5Service
import woyou.stu.sdkservice.clientinterface.IWoyouService as StuService

class SunmiPrinterBridge(private val context: Context) {
  private var jiuiv5Service: Jiuiv5Service? = null
  private var stuService: StuService? = null
  private var isConnected = false
  private var connectLatch = CountDownLatch(1)
  private val printExecutor = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "SunmiPrint").apply { isDaemon = true }
  }

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
          } else {
            Log.e(TAG, "Sunmi service connected but stub is null")
          }
        } catch (e: Exception) {
          Log.e(TAG, "Sunmi stub error: ${e.message}", e)
          isConnected = false
        } finally {
          connectLatch.countDown()
        }
      }

      override fun onServiceDisconnected(name: ComponentName?) {
        Log.w(TAG, "Sunmi service disconnected: ${name?.flattenToShortString()}")
        jiuiv5Service = null
        stuService = null
        isConnected = false
        connectLatch = CountDownLatch(1)
        printExecutor.execute { Thread.sleep(5000); bindService() }
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
        val bound = context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
        Log.d(TAG, "Service binding initiated for ${target.packageName}: $bound")
        if (bound) {
          return
        }
      } catch (e: Exception) {
        Log.e(TAG, "Binding failed for ${target.packageName}: ${e.message}", e)
      }
    }
    connectLatch.countDown()
  }

  fun waitForConnection(timeoutMs: Long = 8000): Boolean {
    if (isConnected()) return true
    bindService()
    connectLatch.await(timeoutMs, TimeUnit.MILLISECONDS)
    val connected = isConnected()
    Log.d(TAG, "waitForConnection($timeoutMs) -> $connected")
    return connected
  }

  fun isConnected(): Boolean = isConnected && (jiuiv5Service != null || stuService != null)

  /** Binds and waits for the Sunmi AIDL service — does not call initPrinter (that runs per job). */
  fun initPrinter(): Boolean = waitForConnection()

  fun getPrinterStatus(): Int {
    if (!isConnected()) return 0
    // Avoid updatePrinterState() on V2s — firmware may echo device info to paper.
    return 1
  }

  /**
   * Sunmi SDK calls must run off the RN bridge thread.
   */
  private fun runOnPrintThread(timeoutMs: Long = 20000, block: () -> Int): Int {
    val latch = CountDownLatch(1)
    var result = -1
    printExecutor.execute {
      try {
        result = block()
      } catch (e: Exception) {
        Log.e(TAG, "Sunmi print thread error: ${e.message}", e)
        result = -1
      } finally {
        latch.countDown()
      }
    }
    latch.await(timeoutMs, TimeUnit.MILLISECONDS)
    return result
  }

  /** initPrinter() must be called before every print job on Sunmi V2s. */
  private fun preparePrinter(): Boolean {
    if (!waitForConnection(3000)) {
      Log.e(TAG, "Service is NULL - cannot prepare printer")
      return false
    }
    return try {
      when {
        stuService != null -> {
          Log.d(TAG, "Calling initPrinter()")
          stuService!!.initPrinter()
        }
        jiuiv5Service != null -> {
          Log.d(TAG, "Calling printerInit()")
          jiuiv5Service!!.printerInit()
        }
        else -> return false
      }
      Thread.sleep(200)
      true
    } catch (e: Exception) {
      Log.e(TAG, "initPrinter failed: ${e.message}", e)
      false
    }
  }

  private fun enterBuffer(clean: Boolean) {
    Log.d(TAG, "enterPrinterBuffer(clean=$clean)")
    when {
      stuService != null -> stuService!!.enterPrinterBuffer(clean)
      jiuiv5Service != null -> jiuiv5Service!!.enterPrinterBuffer(clean)
      else -> throw IllegalStateException("Sunmi printer service not connected")
    }
  }

  private fun exitBuffer(commit: Boolean) {
    Log.d(TAG, "exitPrinterBuffer(commit=$commit)")
    when {
      stuService != null -> stuService!!.exitPrinterBuffer(commit)
      jiuiv5Service != null -> jiuiv5Service!!.exitPrinterBuffer(commit)
      else -> throw IllegalStateException("Sunmi printer service not connected")
    }
  }

  private fun lineWrapAidl(n: Int) {
    Log.d(TAG, "lineWrap($n)")
    when {
      stuService != null -> stuService!!.lineWrap(n, null)
      jiuiv5Service != null -> jiuiv5Service!!.lineWrap(n, null)
      else -> throw IllegalStateException("Sunmi printer service not connected")
    }
  }

  private fun setAlignment(align: Int) {
    when {
      stuService != null -> stuService!!.setAlignment(align, null)
      jiuiv5Service != null -> jiuiv5Service!!.setAlignment(align, null)
      else -> throw IllegalStateException("Sunmi printer service not connected")
    }
  }

  private fun printTextAidl(text: String) {
    val line = if (text.endsWith("\n")) text else "$text\n"
    Log.d(TAG, "printText: $line")
    when {
      stuService != null -> stuService!!.printText(line, null)
      jiuiv5Service != null -> jiuiv5Service!!.printText(line, null)
      else -> throw IllegalStateException("Sunmi printer service not connected")
    }
  }

  private fun sendRawBytes(bytes: ByteArray) {
    Log.d(TAG, "sendRAWData bytes=${bytes.size}")
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

  fun printReceiptBase64(logoBase64: String?, receiptBase64: String): Int {
    Log.d(TAG, "printReceiptBase64 called, service connected=${isConnected()}")
    if (!waitForConnection(3000)) return -1

    return runOnPrintThread {
      var inBuffer = false
      try {
        if (!preparePrinter()) return@runOnPrintThread -1

        enterBuffer(true)
        inBuffer = true

        val logoBitmap = decodeLogoBitmap(logoBase64)
        logoBitmap?.let { bitmap ->
          Log.d(TAG, "Printing logo bitmap")
          printBitmapDirect(bitmap)
          lineWrapAidl(2)
          bitmap.recycle()
        }

        val receiptBytes = Base64.decode(receiptBase64, Base64.DEFAULT)
        sendRawBytes(receiptBytes)

        lineWrapAidl(4)
        exitBuffer(true)
        inBuffer = false

        Log.d(TAG, "Receipt print job committed")
        0
      } catch (e: Exception) {
        Log.e(TAG, "Sunmi receipt print error: ${e.message}", e)
        if (inBuffer) {
          runCatching { exitBuffer(false) }
        }
        -1
      }
    }
  }

  fun printRawDataBase64(base64Data: String): Int {
    Log.d(TAG, "printRawDataBase64 called, service connected=${isConnected()}")
    if (!waitForConnection(3000)) return -1

    return runOnPrintThread {
      var inBuffer = false
      try {
        if (!preparePrinter()) return@runOnPrintThread -1

        enterBuffer(true)
        inBuffer = true

        val bytes = Base64.decode(base64Data, Base64.DEFAULT)
        sendRawBytes(bytes)

        lineWrapAidl(4)
        exitBuffer(true)
        inBuffer = false

        Log.d(TAG, "Raw print job committed")
        0
      } catch (e: Exception) {
        Log.e(TAG, "Sunmi raw print error: ${e.message}", e)
        if (inBuffer) {
          runCatching { exitBuffer(false) }
        }
        -1
      }
    }
  }

  fun printText(content: String, textFormat: ReadableMap): Int {
    Log.d(TAG, "printText called: $content")
    Log.d(TAG, "Service connected: ${isConnected()}")
    if (!waitForConnection(3000)) return -1

    return runOnPrintThread {
      var inBuffer = false
      try {
        if (!preparePrinter()) return@runOnPrintThread -1

        val align = textFormat.getInt("align").coerceIn(0, 2)
        val bold = textFormat.getInt("style") == 1

        enterBuffer(true)
        inBuffer = true

        setAlignment(align)
        if (bold) {
          runCatching {
            when {
              stuService != null -> stuService!!.setPrinterStyle(1, "1")
              jiuiv5Service != null -> jiuiv5Service!!.setPrinterStyle(1, "1")
            }
          }
        }

        printTextAidl(content)

        if (bold) {
          runCatching {
            when {
              stuService != null -> stuService!!.setPrinterStyle(1, "0")
              jiuiv5Service != null -> jiuiv5Service!!.setPrinterStyle(1, "0")
            }
          }
        }

        lineWrapAidl(4)
        exitBuffer(true)
        inBuffer = false

        Log.d(TAG, "Print call completed for: $content")
        0
      } catch (e: Exception) {
        Log.e(TAG, "Print error: ${e.message}", e)
        if (inBuffer) {
          runCatching { exitBuffer(false) }
        }
        -1
      }
    }
  }

  fun printBitmapBase64(base64Data: String, align: Int): Int {
    Log.d(TAG, "printBitmapBase64 called")
    if (!waitForConnection(3000)) return -1

    return runOnPrintThread {
      var inBuffer = false
      try {
        if (!preparePrinter()) return@runOnPrintThread -1

        val bitmap = decodeLogoBitmap(base64Data) ?: return@runOnPrintThread -2

        enterBuffer(true)
        inBuffer = true

        setAlignment(align.coerceIn(0, 2))
        printBitmapDirect(bitmap)
        lineWrapAidl(4)
        exitBuffer(true)
        inBuffer = false

        bitmap.recycle()
        0
      } catch (e: Exception) {
        Log.e(TAG, "Sunmi bitmap error: ${e.message}", e)
        if (inBuffer) {
          runCatching { exitBuffer(false) }
        }
        -1
      }
    }
  }

  /** Basic AIDL diagnostic — confirms initPrinter, printText, and lineWrap work. */
  fun printDiagnostic(): Int {
    Log.d(TAG, "printDiagnostic called, service connected=${isConnected()}")
    if (!waitForConnection(3000)) return -1

    return runOnPrintThread {
      try {
        if (!preparePrinter()) return@runOnPrintThread -1
        Thread.sleep(300)

        setAlignment(1)
        printTextAidl("=== DIAGNOSTIC TEST ===")
        printTextAidl("Sunmi V2s Printer")
        printTextAidl("Status: Working")
        printTextAidl("=======================")
        lineWrapAidl(5)

        Log.d(TAG, "Diagnostic print sent")
        0
      } catch (e: Exception) {
        Log.e(TAG, "Diagnostic error: ${e.message}", e)
        -1
      }
    }
  }

  fun paperOut(lines: Int): Int {
    if (lines <= 0) return 0
    Log.d(TAG, "paperOut($lines)")
    if (!waitForConnection(3000)) return -1

    return runOnPrintThread {
      try {
        if (!preparePrinter()) return@runOnPrintThread -1
        lineWrapAidl(lines.coerceIn(1, 255))
        0
      } catch (e: Exception) {
        Log.e(TAG, "paperOut error: ${e.message}", e)
        -1
      }
    }
  }

  fun cutPaper(): Boolean {
    if (!isConnected()) return false
    return runOnPrintThread {
      try {
        if (!preparePrinter()) return@runOnPrintThread -1
        when {
          stuService != null -> stuService!!.cutPaper(null)
          jiuiv5Service != null -> jiuiv5Service!!.cutPaper(null)
          else -> return@runOnPrintThread -1
        }
        0
      } catch (e: Exception) {
        Log.e(TAG, "cutPaper error: ${e.message}", e)
        -1
      }
    } == 0
  }

  private fun decodeLogoBitmap(base64Data: String?): Bitmap? {
    if (base64Data.isNullOrBlank()) return null
    val decodedBytes = Base64.decode(base64Data, Base64.DEFAULT)
    val decoded = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size) ?: return null
    return BitmapScaler.scaleForReceipt(decoded)
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
