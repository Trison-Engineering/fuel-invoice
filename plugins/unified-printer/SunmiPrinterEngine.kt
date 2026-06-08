package com.fuelreceipt.app.unifiedprinter

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.Log
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import woyou.aidlservice.jiuiv5.IWoyouService as LegacyIWoyouService
import woyou.stu.sdkservice.clientinterface.IWoyouService

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
  private var pendingLegacy = false

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
            if (pendingLegacy) {
              LegacySunmiPrintApi(LegacyIWoyouService.Stub.asInterface(service))
            } else {
              StuSunmiPrintApi(IWoyouService.Stub.asInterface(service))
            }
          } catch (e: Exception) {
            Log.e(TAG, "Service stub error: ${e.message}")
            null
          }
        Log.d(TAG, "Sunmi service connected: ${name?.flattenToShortString()}")
        Log.d(
          TAG,
          "AIDL stub: ${if (pendingLegacy) "woyou.aidlservice.jiuiv5.IWoyouService" else "woyou.stu.sdkservice.clientinterface.IWoyouService"}",
        )
        Log.d(TAG, "printerService is: ${if (printApi != null) "NOT NULL" else "NULL"}")
        connectLatch.countDown()

        val api = printApi
        if (api != null && pendingLegacy) {
          emit("WARMING_UP")
          startAbsorberPrint()
        } else if (api != null) {
          printerReady = true
          emit("CONNECTED")
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
      pendingLegacy = target.legacy
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
          if (api != null && api.usesHighLevelAidl()) {
            val diagBytes = buildDiagnosticBytes()
            api.sendRAWData(diagBytes)
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

    Log.d(TAG, "Starting receipt print via ${api.serviceLabel()}...")

    var logo: Bitmap? = null
    if (!logoBase64.isNullOrBlank() && !api.usesHighLevelAidl()) {
      try {
        logo = processLogoForPrinting(logoBase64)
      } catch (logoErr: Exception) {
        Log.e(TAG, "Logo decode failed, skipping: ${logoErr.message}")
      }
    }

    if (api.usesHighLevelAidl()) {
      api.printReceiptHighLevel(
        storeName,
        address,
        dateTime,
        product,
        volume,
        rate,
        total,
        vehicleNo,
      )
    } else {
      val escPos =
        buildReceiptEscPos(
          storeName,
          address,
          dateTime,
          product,
          volume,
          rate,
          total,
          vehicleNo,
        )
      api.printReceiptEscPos(logo, ensureTerminalFeed(escPos))
    }
    logo?.recycle()
    Log.d(TAG, "Receipt print completed successfully (${api.serviceLabel()})")
  }

  /** High-level AIDL test — printText + lineWrap only (no setAlignment). */
  fun printHelloWorld() {
    val api = printApi ?: throw IllegalStateException("Sunmi printer service not connected")
    Log.d(TAG, "printHelloWorld via ${api.serviceLabel()}")
    api.printHelloWorld()
    Log.d(TAG, "printHelloWorld done")
  }

  /** Diagnostic: sendRAWData only — no enterPrinterBuffer / commit / exit. */
  fun printHelloWorldDirectRaw() {
    val api = printApi ?: throw IllegalStateException("Sunmi printer service not connected")
    val escPos =
      byteArrayOf(
        0x1B,
        0x40,
        0x1B,
        0x61,
        0x01,
        0x48,
        0x65,
        0x6C,
        0x6C,
        0x6F,
        0x20,
        0x57,
        0x6F,
        0x72,
        0x6C,
        0x64,
        0x0A,
        0x1B,
        0x64,
        0x05,
      )
    Log.d(TAG, "printHelloWorldDirectRaw (${api.serviceLabel()}) bytes=${escPos.size}")
    api.sendRAWData(escPos)
    Log.d(TAG, "printHelloWorldDirectRaw sendRAWData done")
  }

  private fun ensureTerminalFeed(escPos: ByteArray): ByteArray {
    if (escPos.size >= 3 &&
      escPos[escPos.size - 3] == 0x1B.toByte() &&
      escPos[escPos.size - 2] == 0x64.toByte() &&
      escPos[escPos.size - 1] == 0x05.toByte()
    ) {
      return escPos
    }
    Log.d(TAG, "Appending terminal paper feed ESC/POS 1B 64 05")
    return escPos + byteArrayOf(0x1B, 0x64, 0x05)
  }

  fun printTestLine() {
    val api = printApi ?: throw IllegalStateException("Not connected")
    if (api.usesHighLevelAidl()) {
      Log.d(TAG, "printTestLine via RAW (${api.serviceLabel()})")
      api.sendRAWData(buildDiagnosticBytes())
      return
    }
    val escPos =
      byteArrayOf(
        0x1B, 0x40, 0x1B, 0x61, 0x01, 0x50, 0x72, 0x69, 0x6E, 0x74, 0x65, 0x72, 0x20,
        0x43, 0x6F, 0x6E, 0x6E, 0x65, 0x63, 0x74, 0x65, 0x64, 0x20, 0x4F, 0x4B, 0x0A,
        0x1B, 0x64, 0x03,
      )
    api.printReceiptEscPos(null, ensureTerminalFeed(escPos))
  }

  private fun buildReceiptEscPos(
    storeName: String,
    address: String,
    dateTime: String,
    product: String,
    volume: String,
    rate: String,
    total: String,
    vehicleNo: String,
  ): ByteArray {
    return buildReceiptBytes(
      storeName,
      address,
      dateTime,
      product,
      volume,
      rate,
      total,
      vehicleNo,
    )
  }

  private interface SunmiPrintApi {
    fun serviceLabel(): String

    fun usesHighLevelAidl(): Boolean

    fun printHelloWorld()

    fun printText(text: String)

    fun lineWrap(lines: Int)

    fun sendRAWData(data: ByteArray)

    fun printBitmap(bitmap: Bitmap)

    /** jiuiv5: single sendRAWData ESC/POS receipt (no text buffer). */
    fun printReceiptHighLevel(
      storeName: String,
      address: String,
      dateTime: String,
      product: String,
      volume: String,
      rate: String,
      total: String,
      vehicleNo: String,
    )

    /** STU only: buffered ESC/POS commit. */
    fun printReceiptEscPos(logo: Bitmap?, escPos: ByteArray)
  }

  private class StuSunmiPrintApi(private val service: IWoyouService) : SunmiPrintApi {
    override fun serviceLabel(): String = "stu IWoyouService"

    override fun usesHighLevelAidl(): Boolean = false

    override fun printHelloWorld() {
      Log.d(TAG, "before printText: Hello World\\n")
      service.printText("${centerPad("Hello World")}\n", null)
      Log.d(TAG, "after printText")
      Log.d(TAG, "before lineWrap(4)")
      service.lineWrap(4, null)
      Log.d(TAG, "after lineWrap(4)")
    }

    override fun printText(text: String) {
      Log.d(TAG, "before printText: ${text.replace("\n", "\\n")}")
      service.printText(text, null)
      Log.d(TAG, "after printText")
    }

    override fun lineWrap(lines: Int) {
      Log.d(TAG, "before lineWrap($lines)")
      service.lineWrap(lines, null)
      Log.d(TAG, "after lineWrap($lines)")
    }

    override fun sendRAWData(data: ByteArray) {
      Log.d(TAG, "before sendRAWData bytes=${data.size}")
      service.sendRAWData(data, null)
      Log.d(TAG, "after sendRAWData")
    }

    override fun printBitmap(bitmap: Bitmap) {
      Log.d(TAG, "before printBitmap")
      service.printBitmap(bitmap, null)
      Log.d(TAG, "after printBitmap")
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
    ) {
      throw UnsupportedOperationException("STU service uses buffered ESC/POS")
    }

    override fun printReceiptEscPos(logo: Bitmap?, escPos: ByteArray) {
      Log.d(TAG, "printReceiptEscPos BUFFERED (${serviceLabel()}) bytes=${escPos.size} logo=${logo != null}")
      Log.d(TAG, "before enterPrinterBuffer")
      service.enterPrinterBuffer(true)
      Log.d(TAG, "after enterPrinterBuffer")
      if (logo != null) {
        printBitmap(logo)
      }
      Log.d(TAG, "before sendRAWData bytes=${escPos.size}")
      service.sendRAWData(escPos, null)
      Log.d(TAG, "after sendRAWData")
      Log.d(TAG, "before commitPrinterBuffer")
      service.commitPrinterBuffer()
      Log.d(TAG, "after commitPrinterBuffer")
    }
  }

  private class LegacySunmiPrintApi(private val service: LegacyIWoyouService) : SunmiPrintApi {
    override fun serviceLabel(): String = "jiuiv5 IWoyouService"

    override fun usesHighLevelAidl(): Boolean = true

    override fun printHelloWorld() {
      Log.d(TAG, "printHelloWorld via RAW (${serviceLabel()})")
      val out = java.io.ByteArrayOutputStream()
      out.write(byteArrayOf(0x1B, 0x40))
      out.write("${centerPad("Hello World")}\n".toByteArray(Charsets.UTF_8))
      out.write(byteArrayOf(0x1B, 0x64, 0x05))
      sendRAWData(out.toByteArray())
    }

    override fun printText(text: String) {
      Log.d(TAG, "before printText: ${text.replace("\n", "\\n")}")
      service.printText(text, null)
      Log.d(TAG, "after printText")
    }

    override fun lineWrap(lines: Int) {
      Log.d(TAG, "before lineWrap($lines)")
      service.lineWrap(lines, null)
      Log.d(TAG, "after lineWrap($lines)")
    }

    override fun sendRAWData(data: ByteArray) {
      Log.d(TAG, "before sendRAWData bytes=${data.size}")
      service.sendRAWData(data, null)
      Log.d(TAG, "after sendRAWData")
    }

    override fun printBitmap(bitmap: Bitmap) {
      Log.d(TAG, "before printBitmap")
      service.printBitmap(bitmap, null)
      Log.d(TAG, "after printBitmap")
    }

    override fun printReceiptEscPos(logo: Bitmap?, escPos: ByteArray) {
      throw UnsupportedOperationException("jiuiv5 does not support ESC/POS receipt printing")
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
        )

      Log.d(TAG, "Sending ${bytes.size} bytes via sendRAWData")
      service.sendRAWData(bytes, null)
      Log.d(TAG, "sendRAWData complete")
    }
  }

  private data class BindTarget(
    val packageName: String,
    val action: String,
    val legacy: Boolean,
  )

  private fun processLogoForPrinting(base64Data: String): Bitmap? {
    return try {
      val bytes = Base64.decode(base64Data, Base64.DEFAULT)
      val original = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null

      val maxWidth = 384
      val maxHeight = 200
      val scaleW = maxWidth.toFloat() / original.width
      val scaleH = maxHeight.toFloat() / original.height
      val scale = minOf(scaleW, scaleH)
      val newW = (original.width * scale).toInt().coerceAtLeast(1)
      val newH = (original.height * scale).toInt().coerceAtLeast(1)

      val scaled = Bitmap.createScaledBitmap(original, newW, newH, true)
      if (scaled != original) original.recycle()

      val result = Bitmap.createBitmap(384, newH, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(result)
      canvas.drawColor(Color.WHITE)

      val paint = Paint()
      val cm = ColorMatrix()
      cm.setSaturation(0f)
      paint.colorFilter = ColorMatrixColorFilter(cm)

      val left = (384 - newW) / 2f
      canvas.drawBitmap(scaled, left, 0f, paint)
      scaled.recycle()
      result
    } catch (e: Exception) {
      Log.e(TAG, "Logo processing error: ${e.message}")
      null
    }
  }

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

      val lines = mutableListOf<String>()

      lines.add(center(storeName.uppercase()))

      val words = address.split(" ")
      var addrLine = ""
      for (word in words) {
        val test = if (addrLine.isEmpty()) word else "$addrLine $word"
        if (test.length <= LINE) {
          addrLine = test
        } else {
          if (addrLine.isNotEmpty()) lines.add(center(addrLine))
          addrLine = word
        }
      }
      if (addrLine.isNotEmpty()) lines.add(center(addrLine))

      lines.add(center("FUEL RECEIPT"))
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
        // V2s_GL often has no stu SDK — prefer jiuiv5 inner PrinterService first.
        BindTarget("woyou.aidlservice.jiuiv5", "woyou.aidlservice.jiuiv5.IWoyouService", true),
        BindTarget("woyou.stu.sdkservice", "woyou.stu.sdkservice.sdkservice", false),
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
