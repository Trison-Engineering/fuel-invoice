package com.fuelreceipt.app.unifiedprinter

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

enum class PrinterType {
  SUNMI,
  NYX,
  UNKNOWN,
}

object DeviceDetector {
  private const val SUNMI_PACKAGE = "woyou.stu.sdkservice"
  private const val SUNMI_PACKAGE_LEGACY = "woyou.aidlservice.jiuiv5"
  private const val NYX_PACKAGE = "net.nyx.printerservice"

  fun detectPrinterType(context: Context): PrinterType {
    val manufacturer = Build.MANUFACTURER.lowercase()
    val model = Build.MODEL.lowercase()
    val brand = Build.BRAND.lowercase()

    if (
      manufacturer.contains("sunmi") ||
      brand.contains("sunmi") ||
      model.contains("v2s") ||
      model.contains("v1s") ||
      model.contains("v2") ||
      model.contains("t2")
    ) {
      return PrinterType.SUNMI
    }

    if (isPackageInstalled(SUNMI_PACKAGE, context) ||
      isPackageInstalled(SUNMI_PACKAGE_LEGACY, context)
    ) {
      return PrinterType.SUNMI
    }

    if (isPackageInstalled(NYX_PACKAGE, context)) {
      return PrinterType.NYX
    }

    if (
      model.contains("handheld-pos") ||
      model.contains("ezpump") ||
      model.contains("nyx")
    ) {
      return PrinterType.NYX
    }

    return PrinterType.UNKNOWN
  }

  private fun isPackageInstalled(packageName: String, context: Context): Boolean {
    return try {
      context.packageManager.getPackageInfo(packageName, 0)
      true
    } catch (_: PackageManager.NameNotFoundException) {
      false
    }
  }
}
