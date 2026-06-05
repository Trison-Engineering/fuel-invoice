package com.fuelreceipt.app.posclassicbt

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.IOException
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Classic Bluetooth SPP/RFCOMM — InnerPrinter on EzPump / Sunmi-style POS devices.
 * UUID 00001101-0000-1000-8000-00805F9B34FB @ 00:11:22:33:44:55
 * Device must be PAIRED in Android Bluetooth settings before connect().
 */
class PosClassicBtPrinterModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var socket: BluetoothSocket? = null
  private var outputStream: OutputStream? = null
  private var connectedAddress: String? = null
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "PosClassicBtPrinter"

  private fun getAdapter(): BluetoothAdapter? {
    val manager =
      reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return manager?.adapter ?: @Suppress("DEPRECATION") BluetoothAdapter.getDefaultAdapter()
  }

  @ReactMethod
  fun isBluetoothEnabled(promise: Promise) {
    val adapter = getAdapter()
    promise.resolve(adapter?.isEnabled == true)
  }

  @ReactMethod
  fun isInnerPrinterPaired(macAddress: String, deviceName: String, promise: Promise) {
    try {
      val adapter = getAdapter()
      if (adapter == null) {
        promise.resolve(false)
        return
      }
      val paired =
        adapter.bondedDevices.any { device ->
          device.address.equals(macAddress, ignoreCase = true) ||
            device.name?.equals(deviceName, ignoreCase = true) == true
        }
      Log.i(TAG, "isInnerPrinterPaired=$paired bonded=${adapter.bondedDevices.size}")
      promise.resolve(paired)
    } catch (e: Exception) {
      promise.reject("PAIR_CHECK_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun openBluetoothSettings(promise: Promise) {
    try {
      val intent =
        Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SETTINGS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun connect(macAddress: String, promise: Promise) {
    executor.execute {
      try {
        connectInternal(macAddress)
        reactApplicationContext.runOnUiQueueThread { promise.resolve(true) }
      } catch (e: Exception) {
        disconnectInternal()
        Log.i(TAG, "connect failed: ${e.message}")
        reactApplicationContext.runOnUiQueueThread {
          promise.reject("CONNECT_ERROR", e.message ?: "Classic Bluetooth connect failed", e)
        }
      }
    }
  }

  private fun connectInternal(macAddress: String) {
    disconnectInternal()

    val adapter = getAdapter() ?: throw IOException("Bluetooth adapter not available")
    if (!adapter.isEnabled) {
      throw IOException("Bluetooth is turned off — enable it in Settings")
    }

    adapter.cancelDiscovery()

    val normalizedMac = macAddress.uppercase()
    val device = findBondedDevice(adapter, normalizedMac)
      ?: throw IOException(
        "InnerPrinter is not paired. Open Android Bluetooth Settings, pair InnerPrinter ($macAddress), then retry."
      )

    Log.i(TAG, "Connecting RFCOMM to ${device.name} (${device.address})")
    socket = openSocket(device)
    outputStream = socket?.outputStream
    connectedAddress = device.address
    Log.i(TAG, "RFCOMM connected to ${device.address}")
  }

  private fun findBondedDevice(adapter: BluetoothAdapter, macAddress: String): BluetoothDevice? {
    return adapter.bondedDevices.firstOrNull { device ->
      device.address.equals(macAddress, ignoreCase = true) ||
        device.name?.equals("InnerPrinter", ignoreCase = true) == true
    }
  }

  private fun openSocket(device: BluetoothDevice): BluetoothSocket {
    val errors = mutableListOf<String>()

    try {
      val sock = device.createRfcommSocketToServiceRecord(SPP_UUID)
      sock.connect()
      Log.i(TAG, "Connected via secure SPP")
      return sock
    } catch (e: Exception) {
      errors.add("secure SPP: ${e.message}")
    }

    try {
      val sock = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID)
      sock.connect()
      Log.i(TAG, "Connected via insecure SPP")
      return sock
    } catch (e: Exception) {
      errors.add("insecure SPP: ${e.message}")
    }

    for (channel in 1..3) {
      try {
        val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
        @Suppress("UNCHECKED_CAST")
        val sock = method.invoke(device, channel) as BluetoothSocket
        sock.connect()
        Log.i(TAG, "Connected via rfcomm channel $channel")
        return sock
      } catch (e: Exception) {
        errors.add("rfcomm channel $channel: ${e.message}")
      }
    }

    throw IOException("RFCOMM connect failed. ${errors.joinToString("; ")}")
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    executor.execute {
      disconnectInternal()
      reactApplicationContext.runOnUiQueueThread { promise.resolve(true) }
    }
  }

  @ReactMethod
  fun isConnected(promise: Promise) {
    promise.resolve(socket?.isConnected == true && outputStream != null)
  }

  @ReactMethod
  fun getConnectedAddress(promise: Promise) {
    promise.resolve(connectedAddress ?: "")
  }

  @ReactMethod
  fun listBondedPrinters(promise: Promise) {
    try {
      val adapter = getAdapter()
      if (adapter == null) {
        promise.resolve("")
        return
      }
      val list =
        adapter.bondedDevices.joinToString("|") { "${it.name ?: "Unknown"}:${it.address}" }
      promise.resolve(list)
    } catch (e: Exception) {
      promise.reject("LIST_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun writeRaw(base64Data: String, promise: Promise) {
    executor.execute {
      try {
        val stream =
          outputStream ?: throw IOException("Classic Bluetooth printer not connected")
        val bytes = Base64.decode(base64Data, Base64.DEFAULT)
        stream.write(bytes)
        stream.flush()
        reactApplicationContext.runOnUiQueueThread { promise.resolve(true) }
      } catch (e: Exception) {
        reactApplicationContext.runOnUiQueueThread {
          promise.reject("WRITE_ERROR", e.message, e)
        }
      }
    }
  }

  private fun disconnectInternal() {
    try {
      outputStream?.close()
    } catch (_: Exception) {
      // ignore
    }
    try {
      socket?.close()
    } catch (_: Exception) {
      // ignore
    }
    outputStream = null
    socket = null
    connectedAddress = null
  }

  companion object {
    private const val TAG = "PosClassicBtPrinter"
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
  }
}
