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
            PACKAGE_JIUIV5 -> jiuiv5Service = Jiuiv5Service.Stub.asInterface(service)
            PACKAGE_STU -> stuService = StuService.Stub.asInterface(service)
            else -> {
              jiuiv5Service = runCatching { Jiuiv5Service.Stub.asInterface(service) }.getOrNull()
              if (jiuiv5Service == null) {
                stuService = runCatching { StuService.Stub.asInterface(service) }.getOrNull()
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
    if (!waitForConnection()) return false
    return try {
      stuService?.initPrinter()
      jiuiv5Service?.printerInit()
      isConnected()
    } catch (e: Exception) {
      Log.w(TAG, "Sunmi init error: ${e.message}")
      isConnected()
    }
  }

  fun getPrinterStatus(): Int {
    if (!isConnected()) return 0
    return try {
      jiuiv5Service?.updatePrinterState()
        ?: stuService?.updatePrinterState()
        ?: 0
    } catch (e: Exception) {
      Log.w(TAG, "Sunmi status error: ${e.message}")
      3
    }
  }

  fun printText(content: String, textFormat: ReadableMap): Int {
    if (!waitForConnection()) return -1
    return try {
      val align = textFormat.getInt("align")
      val fontSize = textFormat.getInt("textSize").toFloat()
      val bold = textFormat.getInt("style") == 1
      val text = if (content.endsWith("\n")) content else "$content\n"

      when {
        jiuiv5Service != null -> {
          val service = jiuiv5Service!!
          service.setAlignment(align, null)
          service.setFontSize(fontSize, null)
          if (bold) service.setPrinterStyle(ENABLE_BOLD, "true")
          service.printText(text, null)
          if (bold) service.setPrinterStyle(ENABLE_BOLD, "false")
        }
        stuService != null -> {
          val service = stuService!!
          service.setAlignment(align, null)
          service.setFontSize(fontSize, null)
          if (bold) service.setPrinterStyle(ENABLE_BOLD, "true")
          service.printText(text, null)
          if (bold) service.setPrinterStyle(ENABLE_BOLD, "false")
        }
        else -> return -1
      }
      0
    } catch (e: Exception) {
      Log.w(TAG, "Sunmi print error: ${e.message}")
      -1
    }
  }

  fun printBitmapBase64(base64Data: String, align: Int): Int {
    if (!waitForConnection()) return -1
    return try {
      val decodedBytes = Base64.decode(base64Data, Base64.DEFAULT)
      val decoded = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
        ?: return -2
      val bitmap = BitmapScaler.scaleToMax(decoded)

      when {
        jiuiv5Service != null -> {
          jiuiv5Service!!.setAlignment(align, null)
          jiuiv5Service!!.printBitmap(bitmap, null)
        }
        stuService != null -> {
          stuService!!.setAlignment(align, null)
          stuService!!.printBitmap(bitmap, null)
        }
        else -> return -1
      }
      0
    } catch (e: Exception) {
      Log.w(TAG, "Sunmi bitmap error: ${e.message}")
      -1
    }
  }

  fun paperOut(lines: Int): Int {
    if (!waitForConnection()) return -1
    return try {
      jiuiv5Service?.lineWrap(lines, null)
      stuService?.lineWrap(lines, null)
      0
    } catch (e: Exception) {
      Log.w(TAG, "Sunmi feed error: ${e.message}")
      -1
    }
  }

  fun cutPaper(): Boolean {
    if (!isConnected()) return false
    return try {
      jiuiv5Service?.cutPaper(null)
      stuService?.cutPaper(null)
      true
    } catch (e: Exception) {
      Log.w(TAG, "Sunmi cut error: ${e.message}")
      false
    }
  }

  private data class BindTarget(val packageName: String, val action: String)

  companion object {
    private const val TAG = "SunmiPrinterBridge"
    private const val PACKAGE_JIUIV5 = "woyou.aidlservice.jiuiv5"
    private const val PACKAGE_STU = "woyou.stu.sdkservice"
    private const val ENABLE_BOLD = 0

    private val BIND_TARGETS =
      listOf(
        BindTarget(PACKAGE_JIUIV5, "woyou.aidlservice.jiuiv5.IWoyouService"),
        BindTarget(PACKAGE_STU, "woyou.stu.sdkservice.sdkservice"),
      )
  }
}
