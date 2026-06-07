package com.fuelreceipt.app.unifiedprinter

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class UnifiedPrinterModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val printerType: PrinterType = DeviceDetector.detectPrinterType(reactContext)
  private val sunmiBridge = SunmiPrinterBridge(reactContext)
  private val nyxBridge = NyxPrinterBridge(reactContext)

  override fun getName(): String = "UnifiedPrinterModule"

  @ReactMethod
  fun getDeviceType(promise: Promise) {
    promise.resolve(printerType.name)
  }

  @ReactMethod
  fun initPrinter(promise: Promise) {
    try {
      when (printerType) {
        PrinterType.SUNMI -> promise.resolve(sunmiBridge.initPrinter())
        PrinterType.NYX -> promise.resolve(nyxBridge.initPrinter())
        PrinterType.UNKNOWN -> {
          val sunmiOk = sunmiBridge.initPrinter()
          if (sunmiOk) {
            promise.resolve(true)
          } else {
            promise.resolve(nyxBridge.initPrinter())
          }
        }
      }
    } catch (e: Exception) {
      promise.reject("INIT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun getPrinterStatus(promise: Promise) {
    try {
      when (activeType()) {
        PrinterType.SUNMI -> promise.resolve(sunmiBridge.getPrinterStatus())
        PrinterType.NYX -> promise.resolve(nyxBridge.getPrinterStatus())
        PrinterType.UNKNOWN -> promise.resolve(0)
      }
    } catch (e: Exception) {
      promise.reject("STATUS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun printRawDataBase64(base64Data: String, promise: Promise) {
    try {
      val code =
        when (activeType()) {
          PrinterType.SUNMI -> sunmiBridge.printRawDataBase64(base64Data)
          PrinterType.NYX -> nyxBridge.printRawDataBase64(base64Data)
          PrinterType.UNKNOWN ->
            if (sunmiBridge.isConnected()) {
              sunmiBridge.printRawDataBase64(base64Data)
            } else {
              nyxBridge.printRawDataBase64(base64Data)
            }
        }
      promise.resolve(code)
    } catch (e: Exception) {
      promise.reject("PRINT_ERROR", e.message, e)
    }
  }

  /** Sunmi only — logo + ESC/POS receipt in one buffered print job. */
  @ReactMethod
  fun printSunmiReceipt(logoBase64: String?, receiptBase64: String, promise: Promise) {
    try {
      val code =
        when (activeType()) {
          PrinterType.SUNMI -> sunmiBridge.printReceiptBase64(logoBase64, receiptBase64)
          PrinterType.UNKNOWN ->
            if (sunmiBridge.isConnected()) {
              sunmiBridge.printReceiptBase64(logoBase64, receiptBase64)
            } else {
              -1
            }
          else -> -1
        }
      promise.resolve(code)
    } catch (e: Exception) {
      promise.reject("PRINT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun printText(content: String, textFormat: ReadableMap, promise: Promise) {
    try {
      val code =
        when (activeType()) {
          PrinterType.SUNMI -> sunmiBridge.printText(content, textFormat)
          PrinterType.NYX -> nyxBridge.printText(content, textFormat)
          PrinterType.UNKNOWN ->
            if (sunmiBridge.isConnected()) {
              sunmiBridge.printText(content, textFormat)
            } else {
              nyxBridge.printText(content, textFormat)
            }
        }
      promise.resolve(code)
    } catch (e: Exception) {
      promise.reject("PRINT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun printBitmapBase64(base64Data: String, align: Int, promise: Promise) {
    try {
      val code =
        when (activeType()) {
          PrinterType.SUNMI -> sunmiBridge.printBitmapBase64(base64Data, align)
          PrinterType.NYX -> nyxBridge.printBitmapBase64(base64Data, align)
          PrinterType.UNKNOWN ->
            if (sunmiBridge.isConnected()) {
              sunmiBridge.printBitmapBase64(base64Data, align)
            } else {
              nyxBridge.printBitmapBase64(base64Data, align)
            }
        }
      if (code == 0 || code == -1203) {
        promise.resolve(true)
      } else if (code < 0) {
        promise.reject("BITMAP_ERROR", "Print bitmap failed (code $code)")
      } else {
        promise.resolve(true)
      }
    } catch (e: Exception) {
      promise.reject("BITMAP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun paperOut(lines: Int, promise: Promise) {
    try {
      val code =
        when (activeType()) {
          PrinterType.SUNMI -> sunmiBridge.paperOut(lines)
          PrinterType.NYX -> nyxBridge.paperOut()
          PrinterType.UNKNOWN ->
            if (sunmiBridge.isConnected()) {
              sunmiBridge.paperOut(lines)
            } else {
              nyxBridge.paperOut()
            }
        }
      promise.resolve(code)
    } catch (e: Exception) {
      promise.reject("FEED_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun cutPaper(promise: Promise) {
    try {
      when (activeType()) {
        PrinterType.SUNMI -> promise.resolve(sunmiBridge.cutPaper())
        else -> promise.resolve(true)
      }
    } catch (e: Exception) {
      promise.reject("CUT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun isConnected(promise: Promise) {
    when (activeType()) {
      PrinterType.SUNMI -> promise.resolve(sunmiBridge.isConnected())
      PrinterType.NYX -> promise.resolve(nyxBridge.isConnected())
      PrinterType.UNKNOWN ->
        promise.resolve(sunmiBridge.isConnected() || nyxBridge.isConnected())
    }
  }

  private fun activeType(): PrinterType {
    if (printerType != PrinterType.UNKNOWN) {
      return printerType
    }
    return when {
      sunmiBridge.isConnected() -> PrinterType.SUNMI
      nyxBridge.isConnected() -> PrinterType.NYX
      else -> PrinterType.UNKNOWN
    }
  }
}
