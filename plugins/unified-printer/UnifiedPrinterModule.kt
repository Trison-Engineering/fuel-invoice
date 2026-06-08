package com.fuelreceipt.app.unifiedprinter

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class UnifiedPrinterModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val printerType: PrinterType = DeviceDetector.detectPrinterType(reactContext)
  private val sunmiEngine = SunmiPrinterEngine.getInstance(reactContext)
  private val nyxBridge = NyxPrinterBridge(reactContext)

  override fun getName(): String = "UnifiedPrinterModule"

  @ReactMethod
  fun getDeviceType(promise: Promise) {
    promise.resolve(printerType.name)
  }

  /** Sunmi: request bind only. NYX: normal init. Never AIDL initPrinter on V2s. */
  @ReactMethod
  fun initPrinter(promise: Promise) {
    try {
      when (printerType) {
        PrinterType.SUNMI -> promise.resolve(sunmiEngine.ensureReady())
        PrinterType.NYX -> promise.resolve(nyxBridge.initPrinter())
        PrinterType.UNKNOWN -> {
          val sunmiOk = sunmiEngine.ensureReady()
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
        PrinterType.SUNMI -> {
          sunmiEngine.ensureReady()
          promise.resolve(sunmiEngine.getStatusCode())
        }
        PrinterType.NYX -> promise.resolve(nyxBridge.getPrinterStatus())
        PrinterType.UNKNOWN -> promise.resolve(0)
      }
    } catch (e: Exception) {
      promise.reject("STATUS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun printRawDataBase64(base64Data: String, promise: Promise) {
    if (activeType() == PrinterType.SUNMI) {
      promise.reject("UNSUPPORTED", "Use SunmiPrinterModule.printReceipt on Sunmi devices")
      return
    }
    try {
      val code =
        when (activeType()) {
          PrinterType.NYX -> nyxBridge.printRawDataBase64(base64Data)
          PrinterType.UNKNOWN -> nyxBridge.printRawDataBase64(base64Data)
          else -> -1
        }
      promise.resolve(code)
    } catch (e: Exception) {
      promise.reject("PRINT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun printSunmiReceipt(logoBase64: String?, receiptBase64: String, promise: Promise) {
    promise.reject("DEPRECATED", "Use SunmiPrinterModule.printReceipt")
  }

  @ReactMethod
  fun printText(content: String, textFormat: ReadableMap, promise: Promise) {
    try {
      val code =
        when (activeType()) {
          PrinterType.SUNMI -> -1
          PrinterType.NYX -> nyxBridge.printText(content, textFormat)
          PrinterType.UNKNOWN ->
            if (sunmiEngine.isConnected()) {
              -1
            } else {
              nyxBridge.printText(content, textFormat)
            }
        }
      if (code == -1 && sunmiEngine.isConnected()) {
        promise.reject("UNSUPPORTED", "Use SunmiPrinterModule.printReceipt on Sunmi devices")
      } else {
        promise.resolve(code)
      }
    } catch (e: Exception) {
      promise.reject("PRINT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun printBitmapBase64(base64Data: String, align: Int, promise: Promise) {
    if (activeType() == PrinterType.SUNMI) {
      promise.reject("UNSUPPORTED", "Logo is printed inside SunmiPrinterModule.printReceipt")
      return
    }
    try {
      val code =
        when (activeType()) {
          PrinterType.NYX -> nyxBridge.printBitmapBase64(base64Data, align)
          PrinterType.UNKNOWN -> nyxBridge.printBitmapBase64(base64Data, align)
          else -> -1
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
    if (activeType() == PrinterType.SUNMI) {
      promise.resolve(0)
      return
    }
    try {
      val code =
        when (activeType()) {
          PrinterType.NYX -> nyxBridge.paperOut()
          PrinterType.UNKNOWN -> nyxBridge.paperOut()
          else -> 0
        }
      promise.resolve(code)
    } catch (e: Exception) {
      promise.reject("FEED_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun cutPaper(promise: Promise) {
    when (activeType()) {
      PrinterType.SUNMI -> promise.resolve(true)
      else -> promise.resolve(true)
    }
  }

  @ReactMethod
  fun isConnected(promise: Promise) {
    when (activeType()) {
      PrinterType.SUNMI -> {
        sunmiEngine.ensureReady()
        promise.resolve(sunmiEngine.isConnected())
      }
      PrinterType.NYX -> promise.resolve(nyxBridge.isConnected())
      PrinterType.UNKNOWN -> {
        sunmiEngine.ensureReady()
        promise.resolve(sunmiEngine.isConnected() || nyxBridge.isConnected())
      }
    }
  }

  /** Sunmi V2s — full receipt in one native job (same engine as status check). */
  @ReactMethod
  fun printReceipt(
    logoBase64: String,
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
    promise: Promise,
  ) {
    if (!sunmiEngine.waitForConnection(5000)) {
      promise.reject("NOT_CONNECTED", "Sunmi printer service not connected")
      return
    }

    Thread {
      try {
        sunmiEngine.printReceipt(
          logoBase64.ifBlank { null },
          storeName,
          address,
          receiptNo,
          date,
          time,
          payment,
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
    if (!sunmiEngine.waitForConnection(5000)) {
      promise.reject("NOT_CONNECTED", "Sunmi printer service not connected")
      return
    }

    Thread {
      try {
        sunmiEngine.printTestLine()
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("TEST_FAILED", e.message, e)
      }
    }.start()
  }

  @ReactMethod
  fun printDiagnostic(promise: Promise) {
    printTestLine(promise)
  }

  private fun activeType(): PrinterType {
    if (printerType != PrinterType.UNKNOWN) {
      return printerType
    }
    return when {
      sunmiEngine.isConnected() -> PrinterType.SUNMI
      nyxBridge.isConnected() -> PrinterType.NYX
      else -> PrinterType.UNKNOWN
    }
  }
}
