package com.fuelreceipt.app.posserial

import android.util.Base64
import android.util.Log
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
  private var connectedBaud: Int = 0

  override fun getName(): String = "PosSerialPrinter"

  @ReactMethod
  fun connect(path: String, baudRate: Int, promise: Promise) {
    try {
      disconnectInternal()
      val file = File(path)
      if (!file.exists()) {
        promise.reject("ENOENT", "Serial device not found: $path")
        return
      }

      configureBaudRate(path, baudRate)

      outputStream = FileOutputStream(file)
      connectedPath = path
      connectedBaud = baudRate
      Log.i(TAG, "Serial connected: $path @ $baudRate baud")
      promise.resolve(true)
    } catch (e: Exception) {
      Log.i(TAG, "Serial connect failed $path @ $baudRate: ${e.message}")
      promise.reject("CONNECT_ERROR", e.message, e)
    }
  }

  private fun configureBaudRate(path: String, baud: Int) {
    val sttyArgs = "stty -F $path $baud cs8 -cstopb -parenb raw"
    val commands =
      listOf(
        arrayOf("su", "-c", sttyArgs),
        arrayOf("sh", "-c", sttyArgs),
      )

    for (cmd in commands) {
      try {
        val process = ProcessBuilder(*cmd).redirectErrorStream(true).start()
        val exit = process.waitFor()
        Log.i(TAG, "stty ${cmd.joinToString(" ")} exit=$exit")
        if (exit == 0) return
      } catch (e: Exception) {
        Log.i(TAG, "stty attempt failed: ${e.message}")
      }
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
  fun getConnectedInfo(promise: Promise) {
    if (connectedPath != null && connectedBaud > 0) {
      promise.resolve("$connectedPath@$connectedBaud")
    } else {
      promise.resolve("")
    }
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
    connectedBaud = 0
  }

  companion object {
    private const val TAG = "PosSerialPrinter"
  }
}
