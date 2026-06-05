package com.fuelreceipt.app.posaidl

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.iposprinter.iposprinterservice.IPosPrinterCallback
import com.iposprinter.iposprinterservice.IPosPrinterService
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class PosAidlPrinterModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var iPosService: IPosPrinterService? = null
  private var serviceConnection: ServiceConnection? = null
  private var activeBackend: String? = null
  private var lastConnectError: String? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun getName(): String = "PosAidlPrinter"

  private data class BindTarget(
    val component: ComponentName? = null,
    val packageName: String? = null,
    val action: String? = null,
  )

  private val bindActions =
    listOf(
      "com.iposprinter.iposprinterservice.IPosPrinterService",
      "com.iposprinter.iposprinterservice.IPosPrintService",
    )

  private val candidatePackages =
    listOf(
      "com.iposprinter.iposprinterservice",
      "com.iposprinter.iposprinterservice2",
      "com.zkc.printer",
      "com.zkc.helper",
      "com.sunmi.printerhelper",
      "woyou.aidlservice.jiuiv5",
    )

  @ReactMethod
  fun connect(promise: Promise) {
    mainHandler.post {
      try {
        connectOnMainThread(promise)
      } catch (e: Exception) {
        promise.reject("CONNECT_ERROR", e.message, e)
      }
    }
  }

  private fun connectOnMainThread(promise: Promise) {
    disconnectInternal()

    val context = reactApplicationContext
    val targets = discoverBindTargets(context)
    val discovered = targets.mapNotNull { it.component?.flattenToShortString() }.distinct()
    val attemptLog = mutableListOf<String>()

    for (target in targets) {
      val serviceRef = AtomicReference<IPosPrinterService?>(null)
      val latch = CountDownLatch(1)

      val connection =
        object : ServiceConnection {
          override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            try {
              serviceRef.set(IPosPrinterService.Stub.asInterface(service))
            } catch (e: Exception) {
              Log.i(TAG, "stub error: ${e.message}")
              serviceRef.set(null)
            }
            latch.countDown()
          }

          override fun onServiceDisconnected(name: ComponentName?) {
            iPosService = null
            activeBackend = null
          }
        }

      serviceConnection = connection
      val intent = buildBindIntent(target)
      val label = target.component?.flattenToShortString()
        ?: "${target.packageName}/${target.action}"

      try {
        val started = context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        attemptLog.add("$label=${if (started) "bind started" else "no service"}")
        if (!started) {
          serviceConnection = null
          continue
        }

        latch.await(6, TimeUnit.SECONDS)
        val service = serviceRef.get()
        if (service != null) {
          iPosService = service
          activeBackend = "ipos"
          lastConnectError = null
          promise.resolve(activeBackend)
          return
        }

        try {
          context.unbindService(connection)
        } catch (_: Exception) {
          // ignore
        }
        serviceConnection = null
      } catch (e: Exception) {
        attemptLog.add("$label=error:${e.message}")
        Log.i(TAG, "bind exception for $label: ${e.message}")
        try {
          context.unbindService(connection)
        } catch (_: Exception) {
          // ignore
        }
        serviceConnection = null
      }
    }

    val installedPackages = findInstalledCandidatePackages(context.packageManager)
    lastConnectError =
      buildString {
        append("Could not bind iPos printer service.")
        if (installedPackages.isNotEmpty()) {
          append(" Installed packages: ")
          append(installedPackages.joinToString(", "))
        } else {
          append(" No known printer packages found on device.")
        }
        if (discovered.isNotEmpty()) {
          append(" Discovered services: ")
          append(discovered.joinToString(", "))
        }
        if (attemptLog.isNotEmpty()) {
          append(" Attempts: ")
          append(attemptLog.joinToString("; "))
        }
      }

    promise.reject("BIND_FAILED", lastConnectError)
  }

  private fun buildBindIntent(target: BindTarget): Intent {
    val intent = Intent()
    when {
      target.component != null -> intent.component = target.component
      target.packageName != null && target.action != null -> {
        intent.setPackage(target.packageName)
        intent.action = target.action
      }
      target.action != null -> intent.action = target.action
    }
    return intent
  }

  private fun discoverBindTargets(context: Context): List<BindTarget> {
    val pm = context.packageManager
    val targets = linkedSetOf<BindTarget>()

    for (action in bindActions) {
      val intent = Intent(action)
      val services =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          pm.queryIntentServices(
            intent,
            PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong())
          )
        } else {
          @Suppress("DEPRECATION")
          pm.queryIntentServices(intent, PackageManager.MATCH_DEFAULT_ONLY)
        }

      for (info in services) {
        val serviceInfo = info.serviceInfo ?: continue
        targets.add(
          BindTarget(
            component = ComponentName(serviceInfo.packageName, serviceInfo.name)
          )
        )
      }
    }

    for (pkg in candidatePackages) {
      if (!isPackageInstalled(pm, pkg)) continue
      for (action in bindActions) {
        targets.add(BindTarget(packageName = pkg, action = action))
      }
      targets.add(
        BindTarget(
          component = ComponentName(pkg, "$pkg.IPosPrinterService")
        )
      )
      targets.add(
        BindTarget(
          component = ComponentName(pkg, "$pkg.service.PrinterService")
        )
      )
    }

    return targets.toList()
  }

  private fun findInstalledCandidatePackages(pm: PackageManager): List<String> {
    return candidatePackages.filter { isPackageInstalled(pm, it) }
  }

  private fun isPackageInstalled(pm: PackageManager, packageName: String): Boolean {
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
      } else {
        @Suppress("DEPRECATION")
        pm.getPackageInfo(packageName, 0)
      }
      true
    } catch (_: Exception) {
      false
    }
  }

  @ReactMethod
  fun getLastConnectError(promise: Promise) {
    promise.resolve(lastConnectError ?: "")
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    mainHandler.post {
      disconnectInternal()
      promise.resolve(true)
    }
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
