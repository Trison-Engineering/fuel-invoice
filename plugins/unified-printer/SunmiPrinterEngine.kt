package com.fuelreceipt.app.unifiedprinter

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import woyou.aidlservice.jiuiv5.IWoyouService as LegacyIWoyouService

/**
 * Production Sunmi V2s_GL printer engine.
 *
 * NEVER call: initPrinter(), printerSelfChecking(), updatePrinterState(),
 * getPrinterModal(), getPrinterSerialNo(), getPrinterThermistorTemp().
 */
class SunmiPrinterEngine private constructor(context: Context) {
  private val appContext = context.applicationContext
  private val mainHandler = Handler(Looper.getMainLooper())
  private var printApi: SunmiPrintApi? = null
  private var connectLatch = CountDownLatch(1)

  @Volatile
  private var printerReady = false

  private var statusEmitter: ((String) -> Unit)? = null
  private val pendingStatus = ArrayDeque<String>()

  fun setStatusEmitter(emitter: (String) -> Unit) {
    statusEmitter = emitter
  }

  private fun emit(status: String) {
    mainHandler.post {
      val emitter = statusEmitter
      if (emitter != null) {
        try {
          emitter(status)
        } catch (e: Exception) {
          Log.e(TAG, "Emit error: ${e.message}")
        }
      } else {
        pendingStatus.addLast(status)
      }
    }
  }

  private val connection =
    object : ServiceConnection {
      override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
        printerReady = false
        printApi =
          try {
            LegacySunmiPrintApi(LegacyIWoyouService.Stub.asInterface(service))
          } catch (e: Exception) {
            Log.e(TAG, "Service stub error: ${e.message}")
            null
          }
        Log.d(TAG, "Sunmi service connected: ${name?.flattenToShortString()}")
        Log.d(TAG, "AIDL stub: woyou.aidlservice.jiuiv5.IWoyouService")
        Log.d(TAG, "printerService is: ${if (printApi != null) "NOT NULL" else "NULL"}")
        connectLatch.countDown()

        val api = printApi
        if (api != null) {
          emit("WARMING_UP")
          startAbsorberPrint()
        }
      }

      override fun onServiceDisconnected(name: ComponentName?) {
        printApi = null
        printerReady = false
        emit("DISCONNECTED")
        connectLatch = CountDownLatch(1)
        Log.w(TAG, "Sunmi service disconnected, retrying in 3s")
        mainHandler.postDelayed({ bindService() }, 3000)
      }
    }

  fun connect(context: Context) {
    bindService()
  }

  fun bindService() {
    if (isConnected()) {
      Log.d(TAG, "Already connected, skip bind")
      return
    }

    connectLatch = CountDownLatch(1)

    for (target in BIND_TARGETS) {
      try {
        val intent = Intent()
        intent.setPackage(target.packageName)
        intent.action = target.action
        val bound = appContext.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        Log.d(TAG, "bindService ${target.packageName} result: $bound")
        if (!bound) continue

        connectLatch.await(6000, TimeUnit.MILLISECONDS)
        if (isConnected()) {
          Log.d(TAG, "Bound via ${target.packageName}")
          return
        }

        try {
          appContext.unbindService(connection)
        } catch (_: Exception) {
        }
        printApi = null
        connectLatch = CountDownLatch(1)
      } catch (e: Exception) {
        Log.e(TAG, "bindService error (${target.packageName}): ${e.message}")
      }
    }

    connectLatch.countDown()
    Log.w(TAG, "All Sunmi bind attempts failed")
  }

  fun waitForConnection(timeoutMs: Long = 10000): Boolean {
    if (isConnected()) return true
    bindService()
    val deadline = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < deadline) {
      if (isConnected()) return true
      try {
        Thread.sleep(100)
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        break
      }
    }
    return isConnected()
  }

  fun isConnected(): Boolean = printApi != null

  fun ensureReady(): Boolean = waitForConnection()

  fun getStatusCode(): Int = if (isConnected()) 1 else 0

  /** jiuiv5: silent wait — no print commands (setAlignment triggers diagnostic). */
  private fun startAbsorberPrint() {
    Thread {
      try {
        Log.d(TAG, "absorber started")
        Thread.sleep(4500)
        printerReady = true
        Log.d(TAG, "absorber complete printer ready")

        try {
          val api = printApi
          if (api != null) {
            api.sendRAWData(buildDiagnosticBytes())
            Log.d(TAG, "Diagnostic slip sent via RAW")
          }
        } catch (e: Exception) {
          Log.e(TAG, "Diagnostic print failed: ${e.message}")
        }

        emit("CONNECTED")
      } catch (e: Exception) {
        Log.e(TAG, "absorber error: ${e.message}")
        printerReady = true
        emit("CONNECTED")
      }
    }.start()
  }

  private fun waitForPrinterReady() {
    if (printerReady) return
    val deadline = System.currentTimeMillis() + 10_000
    while (System.currentTimeMillis() < deadline) {
      if (printerReady) return
      try {
        Thread.sleep(200)
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        break
      }
    }
    if (!printerReady) {
      throw IllegalStateException("NOT_READY")
    }
  }

  fun printReceipt(
    logoBase64: String?,
    storeName: String,
    address: String,
    dateTime: String,
    product: String,
    volume: String,
    rate: String,
    total: String,
    vehicleNo: String,
  ) {
    val api = printApi ?: throw IllegalStateException("Sunmi printer service not connected")

    waitForPrinterReady()

    Log.d(TAG, "Starting receipt print via jiuiv5 RAW...")

    api.printReceiptHighLevel(
      storeName,
      address,
      dateTime,
      product,
      volume,
      rate,
      total,
      vehicleNo,
      "",
      false,
    )
    Log.d(TAG, "Receipt print completed successfully")
  }

  fun printFullReceipt(
    logoBase64: String?,
    storeName: String,
    address: String,
    dateTime: String,
    product: String,
    volume: String,
    rate: String,
    total: String,
    vehicleNo: String,
    stationPhone: String,
    isDuplicate: Boolean,
  ) {
    val api = printApi ?: throw IllegalStateException("Sunmi printer service not connected")
    waitForPrinterReady()
    api.enterBuffer()
    try {
      if (!logoBase64.isNullOrBlank()) {
        try {
          val cleanStr = logoBase64.substringAfter("base64,", logoBase64)
          val bytes = android.util.Base64.decode(cleanStr, android.util.Base64.DEFAULT)
          val decoded = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
          if (decoded != null) {
            val maxW = 384
            val tw = if (decoded.width > maxW) maxW else decoded.width
            val th = decoded.height * tw / decoded.width
            val scaled = android.graphics.Bitmap.createScaledBitmap(decoded, tw, th, true)
            Log.i(TAG, "printFullReceipt logo ${scaled.width}x${scaled.height}")
            api.printBitmapCustom(scaled, 2)
          }
        } catch (e: Exception) {
          Log.e(TAG, "logo failed: ${e.message}")
        }
      }
      api.printReceiptHighLevel(
        storeName,
        address,
        dateTime,
        product,
        volume,
        rate,
        total,
        vehicleNo,
        stationPhone,
        isDuplicate,
      )
    } finally {
      api.exitBufferCommit()
    }
  }

  fun printLogo(logoBase64: String) {
    val api = printApi ?: throw IllegalStateException("Sunmi printer service not connected")
    waitForPrinterReady()
    val clean = logoBase64.substringAfter("base64,", logoBase64)
    val bytes = android.util.Base64.decode(clean, android.util.Base64.DEFAULT)
    val decoded = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
      ?: throw IllegalStateException("Could not decode logo bitmap")
    // Scale so width <= 384 (thermal max); keep aspect ratio.
    val maxW = 384
    val targetW = if (decoded.width > maxW) maxW else decoded.width
    val targetH = decoded.height * targetW / decoded.width
    val scaled = android.graphics.Bitmap.createScaledBitmap(decoded, targetW, targetH, true)
    Log.i(TAG, "printLogo scaled ${scaled.width}x${scaled.height}")
    api.printBitmapCustom(scaled, 2)
  }

  fun printHelloWorld() {
    val api = printApi ?: throw IllegalStateException("Sunmi printer service not connected")
    Log.d(TAG, "printHelloWorld via jiuiv5 RAW")
    api.printHelloWorld()
    Log.d(TAG, "printHelloWorld done")
  }

  /** Diagnostic: sendRAWData only. */
  fun printHelloWorldDirectRaw() {
    val api = printApi ?: throw IllegalStateException("Sunmi printer service not connected")
    Log.d(TAG, "printHelloWorldDirectRaw (jiuiv5)")
    api.sendRAWData(
      byteArrayOf(
        0x1B, 0x40, 0x1B, 0x61, 0x01, 0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x20, 0x57, 0x6F, 0x72,
        0x6C, 0x64, 0x0A, 0x1B, 0x64, 0x05,
      )
    )
    Log.d(TAG, "printHelloWorldDirectRaw sendRAWData done")
  }

  fun printTestLine() {
    val api = printApi ?: throw IllegalStateException("Not connected")
    Log.d(TAG, "printTestLine via RAW (jiuiv5)")
    api.sendRAWData(buildDiagnosticBytes())
  }

  private interface SunmiPrintApi {
    fun printHelloWorld()

    fun sendRAWData(data: ByteArray)

    fun printBitmap(bitmap: android.graphics.Bitmap)

    fun printBitmapCustom(bitmap: android.graphics.Bitmap, type: Int)

    fun enterBuffer()

    fun exitBufferCommit()

    fun printReceiptHighLevel(
      storeName: String,
      address: String,
      dateTime: String,
      product: String,
      volume: String,
      rate: String,
      total: String,
      vehicleNo: String,
      stationPhone: String,
      isDuplicate: Boolean,
    )
  }

  private class LegacySunmiPrintApi(private val service: LegacyIWoyouService) : SunmiPrintApi {
    override fun printHelloWorld() {
      Log.d(TAG, "printHelloWorld via RAW (jiuiv5)")
      val out = java.io.ByteArrayOutputStream()
      out.write(byteArrayOf(0x1B, 0x40))
      out.write("${centerPad("Hello World")}\n".toByteArray(Charsets.UTF_8))
      out.write(byteArrayOf(0x1B, 0x64, 0x05))
      sendRAWData(out.toByteArray())
    }

    override fun sendRAWData(data: ByteArray) {
      Log.d(TAG, "before sendRAWData bytes=${data.size}")
      service.sendRAWData(data, null)
      Log.d(TAG, "after sendRAWData")
    }

    override fun printBitmap(bitmap: android.graphics.Bitmap) {
      Log.i(TAG, "printBitmap via AIDL start, ${bitmap.width}x${bitmap.height}")
      service.printBitmap(bitmap, null)
      service.lineWrap(2, null)
      Log.i(TAG, "printBitmap via AIDL done")
    }

    override fun printBitmapCustom(bitmap: android.graphics.Bitmap, type: Int) {
      Log.i(TAG, "printBitmapCustom type=$type ${bitmap.width}x${bitmap.height}")
      service.printBitmapCustom(bitmap, type, null)
      service.lineWrap(2, null)
      Log.i(TAG, "printBitmapCustom done type=$type")
    }

    override fun enterBuffer() {
      Log.i(TAG, "enterPrinterBuffer")
      service.enterPrinterBuffer(true)
    }

    override fun exitBufferCommit() {
      Log.i(TAG, "exitPrinterBuffer commit")
      service.exitPrinterBuffer(true)
    }

    override fun printReceiptHighLevel(
      storeName: String,
      address: String,
      dateTime: String,
      product: String,
      volume: String,
      rate: String,
      total: String,
      vehicleNo: String,
      stationPhone: String,
      isDuplicate: Boolean,
    ) {
      Log.d(TAG, "Starting RAW ESC/POS print...")

      val bytes =
        buildReceiptBytes(
          storeName,
          address,
          dateTime,
          product,
          volume,
          rate,
          total,
          vehicleNo,
          stationPhone,
          isDuplicate,
        )

      Log.d(TAG, "Sending ${bytes.size} bytes via sendRAWData")
      service.sendRAWData(bytes, null)
      Log.d(TAG, "sendRAWData complete")
    }
  }

  private data class BindTarget(
    val packageName: String,
    val action: String,
  )

  companion object {
    private const val TAG = "SunmiPrinter"
    private const val LINE_WIDTH = 32
    private const val DIVIDER = "--------------------------------"

    private fun buildReceiptBytes(
      storeName: String,
      address: String,
      dateTime: String,
      product: String,
      volume: String,
      rate: String,
      total: String,
      vehicleNo: String,
      stationPhone: String,
      isDuplicate: Boolean,
    ): ByteArray {
      val LINE = 32
      val DIV = "-".repeat(LINE)

      fun center(text: String): String {
        if (text.length >= LINE) return text
        val sp = (LINE - text.length) / 2
        return " ".repeat(sp) + text
      }

      fun row(label: String, value: String): String {
        val totalLen = label.length + value.length
        if (totalLen >= LINE) {
          val max = LINE - value.length - 1
          return label.substring(0, max.coerceAtLeast(1)) + " " + value
        }
        val spaces = LINE - totalLen
        return label + " ".repeat(spaces) + value
      }

      // Mirror wrapWordLines() in BluetoothPrinterService.ts: word-wrap at LINE, center each line.
      fun wrapWordLines(text: String): List<String> {
        val words = text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        val wrapped = mutableListOf<String>()
        var current = ""
        for (word in words) {
          val test = if (current.isEmpty()) word else "$current $word"
          if (test.length <= LINE) {
            current = test
          } else {
            if (current.isNotEmpty()) wrapped.add(center(current))
            current = word
          }
        }
        if (current.isNotEmpty()) wrapped.add(center(current))
        return wrapped
      }

      val lines = mutableListOf<String>()

      lines.add(center("Welcome to"))
      lines.addAll(wrapWordLines(storeName.uppercase()))
      lines.addAll(wrapWordLines(address))
      lines.add(center("FUEL RECEIPT"))

      if (isDuplicate) {
        lines.add(center("** DUPLICATE COPY **"))
      }

      lines.add(DIV)
      lines.add(row("DATE:", dateTime))
      lines.add(DIV)
      lines.add(row("PRODUCT:", product))
      lines.add(row("VOLUME:", "$volume LTR"))
      lines.add(row("RATE/LTR:", "Rs. $rate"))
      lines.add(DIV)
      lines.add(row("TOTAL AMOUNT:", "Rs. $total"))
      lines.add(DIV)

      if (vehicleNo.isNotBlank()) {
        lines.add(row("VEHICLE NO:", vehicleNo))
        lines.add(DIV)
      }

      lines.add(center("POWERED BY TRISON"))

      val phone = stationPhone.trim()
      if (phone.isNotEmpty()) {
        lines.addAll(wrapWordLines("Thank you for visiting us! Contact Us : $phone"))
      } else {
        lines.add(center("Thank you for visiting us!"))
      }

      val out = java.io.ByteArrayOutputStream()
      out.write(byteArrayOf(0x1B, 0x40))
      for (line in lines) {
        out.write((line + "\n").toByteArray(Charsets.UTF_8))
      }
      out.write(byteArrayOf(0x1B, 0x64, 0x05))
      return out.toByteArray()
    }

    private fun buildDiagnosticBytes(): ByteArray {
      val out = java.io.ByteArrayOutputStream()
      out.write(byteArrayOf(0x1B, 0x40))
      out.write("--------------------------------\n".toByteArray())
      out.write("   PRINTER CONNECTED OK\n".toByteArray())
      out.write("   Sunmi V2s_GL Ready\n".toByteArray())
      out.write("--------------------------------\n".toByteArray())
      out.write(byteArrayOf(0x1B, 0x64, 0x03))
      return out.toByteArray()
    }

    private fun centerPad(text: String, width: Int = LINE_WIDTH): String {
      if (text.length >= width) return text
      val spaces = (width - text.length) / 2
      return " ".repeat(spaces) + text
    }

    private fun formatRow(label: String, value: String): String {
      val totalLen = label.length + value.length
      if (totalLen >= LINE_WIDTH) {
        val maxLabel = (LINE_WIDTH - value.length - 1).coerceAtLeast(1)
        return label.substring(0, minOf(maxLabel, label.length)) + " " + value
      }
      val spaces = LINE_WIDTH - totalLen
      return label + " ".repeat(spaces) + value
    }

    private fun wrapText(text: String, width: Int): List<String> {
      if (text.isBlank()) return emptyList()
      val words = text.trim().split("\\s+".toRegex())
      val lines = ArrayList<String>()
      val line = StringBuilder()
      for (word in words) {
        val candidate = if (line.isEmpty()) word else "${line} $word"
        if (candidate.length <= width) {
          line.clear()
          line.append(candidate)
        } else {
          if (line.isNotEmpty()) {
            lines.add(line.toString())
            line.clear()
          }
          line.append(word)
        }
      }
      if (line.isNotEmpty()) {
        lines.add(line.toString())
      }
      return lines
    }

    private val BIND_TARGETS =
      listOf(
        BindTarget("woyou.aidlservice.jiuiv5", "woyou.aidlservice.jiuiv5.IWoyouService"),
      )

    @Volatile
    private var instance: SunmiPrinterEngine? = null

    fun getInstance(context: Context): SunmiPrinterEngine {
      return instance ?: synchronized(this) {
        instance ?: SunmiPrinterEngine(context.applicationContext).also { instance = it }
      }
    }
  }
}
