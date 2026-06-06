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
import woyou.stu.sdkservice.clientinterface.IWoyouService

class SunmiPrinterBridge(private val context: Context) {
  private var sunmiService: IWoyouService? = null
  private var isConnected = false
  private val mainHandler = Handler(Looper.getMainLooper())

  private val serviceConnection =
    object : ServiceConnection {
      override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
        sunmiService = IWoyouService.Stub.asInterface(service)
        isConnected = true
        Log.d(TAG, "Sunmi printer service connected")
      }

      override fun onServiceDisconnected(name: ComponentName?) {
        sunmiService = null
        isConnected = false
        mainHandler.postDelayed({ bindService() }, 5000)
      }
    }

  init {
    bindService()
  }

  fun bindService() {
    val intent = Intent()
    intent.setPackage("woyou.stu.sdkservice")
    intent.action = "woyou.stu.sdkservice.sdkservice"
    try {
      context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    } catch (e: Exception) {
      Log.w(TAG, "Sunmi bind failed: ${e.message}")
    }
  }

  fun isConnected(): Boolean = isConnected && sunmiService != null

  fun initPrinter(): Boolean {
    val service = sunmiService ?: return false
    return try {
      service.initPrinter()
      true
    } catch (e: Exception) {
      Log.w(TAG, "Sunmi init error: ${e.message}")
      false
    }
  }

  fun getPrinterStatus(): Int {
    val service = sunmiService ?: return 0
    return try {
      service.updatePrinterState()
    } catch (e: Exception) {
      Log.w(TAG, "Sunmi status error: ${e.message}")
      3
    }
  }

  fun printText(content: String, textFormat: ReadableMap): Int {
    val service = sunmiService ?: return -1
    return try {
      val align = textFormat.getInt("align")
      val fontSize = textFormat.getInt("textSize").toFloat()
      val bold = textFormat.getInt("style") == 1

      service.setAlignment(align, null)
      if (bold) {
        service.sendRAWData(buildBoldTextCommand(content), null)
      } else {
        service.printTextWithFont(content, "monospace", fontSize, null)
      }
      0
    } catch (e: Exception) {
      Log.w(TAG, "Sunmi print error: ${e.message}")
      -1
    }
  }

  fun printBitmapBase64(base64Data: String, align: Int): Int {
    val service = sunmiService ?: return -1
    return try {
      val decodedBytes = Base64.decode(base64Data, Base64.DEFAULT)
      val decoded = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
        ?: return -2

      val bitmap = BitmapScaler.scaleToMax(decoded)

      service.setAlignment(align, null)
      service.printBitmap(bitmap, null)
      0
    } catch (e: Exception) {
      Log.w(TAG, "Sunmi bitmap error: ${e.message}")
      -1
    }
  }

  fun paperOut(lines: Int): Int {
    val service = sunmiService ?: return -1
    return try {
      service.lineWrap(lines, null)
      0
    } catch (e: Exception) {
      Log.w(TAG, "Sunmi feed error: ${e.message}")
      -1
    }
  }

  fun cutPaper(): Boolean {
    val service = sunmiService ?: return false
    return try {
      service.cutPaper(null)
      true
    } catch (e: Exception) {
      Log.w(TAG, "Sunmi cut error: ${e.message}")
      false
    }
  }

  private fun buildBoldTextCommand(text: String): ByteArray {
    val boldOn = byteArrayOf(0x1B, 0x45, 0x01)
    val boldOff = byteArrayOf(0x1B, 0x45, 0x00)
    val textBytes = (text).toByteArray(Charsets.UTF_8)
    return boldOn + textBytes + boldOff
  }

  companion object {
    private const val TAG = "SunmiPrinterBridge"
  }
}
