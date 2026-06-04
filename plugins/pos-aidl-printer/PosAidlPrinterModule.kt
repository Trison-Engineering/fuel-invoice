package com.fuelreceipt.app.posaidl

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.iposprinter.iposprinterservice.IPosPrinterCallback
import com.iposprinter.iposprinterservice.IPosPrinterService

class PosAidlPrinterModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var iPosService: IPosPrinterService? = null
  private var serviceConnection: ServiceConnection? = null
  private var activeBackend: String? = null

  override fun getName(): String = "PosAidlPrinter"

  private val bindActions =
    listOf(
      "com.iposprinter.iposprinterservice.IPosPrintService",
      "com.iposprinter.iposprinterservice.IPosPrinterService",
    )

  @ReactMethod
  fun connect(promise: Promise) {
    disconnectInternal()

    val context = reactApplicationContext
    var bound = false

    for (action in bindActions) {
      if (bound) break

      val latch = java.util.concurrent.CountDownLatch(1)

      val connection =
        object : ServiceConnection {
          override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            try {
              iPosService = IPosPrinterService.Stub.asInterface(service)
              activeBackend = "ipos"
              bound = true
            } catch (e: Exception) {
              Log.i(TAG, "bind error: ${e.message}")
              iPosService = null
              activeBackend = null
            }
            latch.countDown()
          }

          override fun onServiceDisconnected(name: ComponentName?) {
            iPosService = null
            activeBackend = null
          }
        }

      serviceConnection = connection

      val intent = Intent()
      intent.setPackage("com.iposprinter.iposprinterservice")
      intent.setAction(action)

      try {
        val started = context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        if (!started) {
          context.unbindService(connection)
          serviceConnection = null
          continue
        }

        val completed = latch.await(8, java.util.concurrent.TimeUnit.SECONDS)
        if (bound && iPosService != null) {
          promise.resolve(activeBackend)
          return
        }

        try {
          context.unbindService(connection)
        } catch (_: Exception) {
          // ignore
        }
        serviceConnection = null
        iPosService = null
        activeBackend = null
      } catch (e: Exception) {
        Log.i(TAG, "bind exception: ${e.message}")
        try {
          context.unbindService(connection)
        } catch (_: Exception) {
          // ignore
        }
        serviceConnection = null
      }
    }

    promise.reject(
      "BIND_FAILED",
      "Could not bind iPos printer service (com.iposprinter.iposprinterservice)"
    )
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    disconnectInternal()
    promise.resolve(true)
  }

  @ReactMethod
  fun isConnected(promise: Promise) {
    promise.resolve(iPosService != null)
  }

  @ReactMethod
  fun getBackend(promise: Promise) {
    promise.resolve(activeBackend ?: "")
  }

  @ReactMethod
  fun getPrinterStatus(promise: Promise) {
    val service = iPosService
    if (service == null) {
      promise.reject("NOT_CONNECTED", "Printer service not connected")
      return
    }

    try {
      promise.resolve(service.getPrinterStatus())
    } catch (e: Exception) {
      promise.reject("STATUS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun writeRaw(base64Data: String, promise: Promise) {
    val service = iPosService
    if (service == null) {
      promise.reject("NOT_CONNECTED", "Printer service not connected")
      return
    }

    try {
      val bytes = Base64.decode(base64Data, Base64.DEFAULT)
      val status = service.getPrinterStatus()
      if (status == 1) {
        promise.reject("PAPERLESS", "Printer is out of paper")
        return
      }

      service.printRawData(
        bytes,
        object : IPosPrinterCallback.Stub() {
          override fun onRunResult(isSuccess: Boolean) {
            if (!isSuccess) {
              promise.reject("PRINT_FAILED", "printRawData failed")
              return
            }

            try {
              service.printerPerformPrint(
                3,
                object : IPosPrinterCallback.Stub() {
                  override fun onRunResult(performSuccess: Boolean) {
                    if (performSuccess) {
                      promise.resolve(true)
                    } else {
                      promise.reject("PRINT_FAILED", "printerPerformPrint failed")
                    }
                  }

                  override fun onReturnString(value: String) {
                    // ignore
                  }
                }
              )
            } catch (e: Exception) {
              promise.reject("PRINT_ERROR", e.message, e)
            }
          }

          override fun onReturnString(value: String) {
            // ignore
          }
        }
      )
    } catch (e: Exception) {
      promise.reject("PRINT_ERROR", e.message, e)
    }
  }

  private fun disconnectInternal() {
    val connection = serviceConnection
    if (connection != null) {
      try {
        reactApplicationContext.unbindService(connection)
      } catch (e: Exception) {
        Log.i(TAG, "unbind: ${e.message}")
      }
    }
    serviceConnection = null
    iPosService = null
    activeBackend = null
  }

  companion object {
    private const val TAG = "PosAidlPrinter"
  }
}
