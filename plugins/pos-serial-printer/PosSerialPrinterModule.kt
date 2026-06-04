package com.fuelreceipt.app.posserial

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream

class PosSerialPrinterModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var outputStream: FileOutputStream? = null
  private var connectedPath: String? = null

  override fun getName(): String = "PosSerialPrinter"

  @ReactMethod
  fun connect(path: String, promise: Promise) {
    try {
      disconnectInternal()
      val file = File(path)
      if (!file.exists()) {
        promise.reject("ENOENT", "Serial device not found: $path")
        return
      }
      outputStream = FileOutputStream(file)
      connectedPath = path
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CONNECT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    try {
      disconnectInternal()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("DISCONNECT_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun isConnected(promise: Promise) {
    promise.resolve(outputStream != null)
  }

  @ReactMethod
  fun writeRaw(base64Data: String, promise: Promise) {
    try {
      val stream =
        outputStream
          ?: run {
            promise.reject("NOT_CONNECTED", "Serial printer not connected")
            return
          }
      val bytes = Base64.decode(base64Data, Base64.DEFAULT)
      stream.write(bytes)
      stream.flush()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WRITE_ERROR", e.message, e)
    }
  }

  private fun disconnectInternal() {
    try {
      outputStream?.close()
    } catch (_: Exception) {
      // ignore
    }
    outputStream = null
    connectedPath = null
  }
}
