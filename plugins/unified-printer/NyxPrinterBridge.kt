package com.fuelreceipt.app.unifiedprinter

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.ReadableMap
import net.nyx.printerservice.print.IPrinterService
import net.nyx.printerservice.print.PrintTextFormat

class NyxPrinterBridge(private val context: Context) {
  private var printerService: IPrinterService? = null
  private var isConnected = false
  private val mainHandler = Handler(Looper.getMainLooper())

  private val serviceConnection =
    object : ServiceConnection {
      override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
        printerService = IPrinterService.Stub.asInterface(service)
        isConnected = true
        Log.d(TAG, "NYX printer service connected")
      }

      override fun onServiceDisconnected(name: ComponentName?) {
        printerService = null
        isConnected = false
        mainHandler.postDelayed({ bindService() }, 5000)
      }
    }

  init {
    bindService()
  }

  fun bindService() {
    val intent = Intent()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.setPackage("com.incar.printerservice")
      intent.action = "com.incar.printerservice.IPrinterService"
    } else {
      intent.setPackage("net.nyx.printerservice")
      intent.action = "net.nyx.printerservice.IPrinterService"
    }
    try {
      context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    } catch (e: Exception) {
      Log.w(TAG, "NYX bind failed: ${e.message}")
    }
  }

  fun isConnected(): Boolean = isConnected && printerService != null

  fun initPrinter(): Boolean {
    return isConnected()
  }

  fun getPrinterStatus(): Int {
    val service = printerService ?: return 0
    return try {
      service.getPrinterStatus()
    } catch (e: Exception) {
      Log.w(TAG, "NYX status error: ${e.message}")
      -1
    }
  }

  fun printText(content: String, textFormat: ReadableMap): Int {
    val service = printerService ?: return -1
    val format = PrintTextFormat()
    format.setAli(textFormat.getInt("align"))
    format.setTextSize(textFormat.getInt("textSize"))
    format.setUnderline(textFormat.getBoolean("underline"))
    format.setTextScaleX(textFormat.getDouble("textScaleX").toFloat())
    format.setTextScaleY(textFormat.getDouble("textScaleY").toFloat())
    format.setLetterSpacing(textFormat.getDouble("letterSpacing").toFloat())
    format.setLineSpacing(textFormat.getDouble("lineSpacing").toFloat())
    format.setTopPadding(textFormat.getInt("topPadding"))
    format.setLeftPadding(textFormat.getInt("leftPadding"))
    format.setStyle(textFormat.getInt("style"))
    format.setFont(textFormat.getInt("font"))
    return service.printText(content, format)
  }

  fun printBitmapBase64(base64Data: String, align: Int): Int {
    val service = printerService ?: return -1
    val decodedBytes = Base64.decode(base64Data, Base64.DEFAULT)
    val decoded = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
      ?: return -2
    val bitmap = BitmapScaler.scaleForReceipt(decoded)
    return service.printBitmap(bitmap, 1, align)
  }

  fun paperOut(): Int {
    val service = printerService ?: return -1
    return service.paperOut(80)
  }

  fun printRawDataBase64(base64Data: String): Int {
    val service = printerService ?: return -1
    return try {
      val bytes = Base64.decode(base64Data, Base64.DEFAULT)
      service.printEscposData(bytes)
    } catch (e: Exception) {
      Log.w(TAG, "NYX raw print error: ${e.message}")
      -1
    }
  }

  companion object {
    private const val TAG = "NyxPrinterBridge"
  }
}
