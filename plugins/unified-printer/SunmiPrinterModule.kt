package com.fuelreceipt.app.unifiedprinter

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class SunmiPrinterModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val engine = SunmiPrinterEngine.getInstance(reactContext)

  init {
    engine.setStatusEmitter { status ->
      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("SunmiPrinterStatus", status)
    }
  }

  override fun getName(): String = "SunmiPrinterModule"

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

  /** High-level AIDL test: setAlignment + printText + lineWrap (no init/selfCheck). */
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
}
