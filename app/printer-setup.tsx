import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePrinterContext } from "../contexts/PrinterContext";
import { PAPER_WIDTH_MM, RECEIPT_LINE_WIDTH } from "../constants/printerPaper";
import { colors, spacing } from "../constants/theme";

function DismissButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityLabel="Dismiss"
      style={{
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
      }}
    >
      <Ionicons name="close" size={20} color={colors.muted} />
    </Pressable>
  );
}

function statusColor(
  status: string,
  connectionStatus: string,
  connectionStatusColor: string
): string {
  if (connectionStatus === "warming_up") return connectionStatusColor;
  if (connectionStatus !== "connected") return connectionStatusColor;
  if (status === "Normal") return colors.success;
  if (status === "Out of paper") return colors.error;
  return colors.error;
}

export default function PrinterSetupScreen() {
  const printer = usePrinterContext();
  const [isPrinting, setIsPrinting] = useState(false);

  const isBusy = printer.isInitializing || printer.isReconnecting || isPrinting;

  const runInit = useCallback(() => {
    printer.initPrinter().catch(() => undefined);
  }, [printer]);

  useEffect(() => {
    runInit();
  }, [runInit]);

  const handleTestPrint = async () => {
    setIsPrinting(true);
    try {
      await printer.testPrint();
      Alert.alert("Print complete", "Test receipt sent to the built-in printer.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Test print failed";
      Alert.alert("Print failed", message);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleHelloWorldPrint = async () => {
    if (deviceType !== "SUNMI") {
      Alert.alert("Not available", "Hello World test is only for Sunmi built-in printers.");
      return;
    }
    setIsPrinting(true);
    try {
      await printer.printHelloWorld();
      Alert.alert("Hello World", "High-level AIDL test sent to the printer.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Hello World print failed";
      Alert.alert("Print failed", message);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDiagnosticPrint = async () => {
    if (deviceType !== "SUNMI") {
      Alert.alert("Not available", "Diagnostic print is only for Sunmi built-in printers.");
      return;
    }
    setIsPrinting(true);
    try {
      const result = await printer.printDiagnostic();
      Alert.alert("Diagnostic", result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Diagnostic print failed";
      Alert.alert("Diagnostic Failed", message);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleCalibrationPrint = async () => {
    setIsPrinting(true);
    try {
      await printer.printCalibration();
      Alert.alert(
        "Calibration printed",
        `Count characters on the numbered line (${RECEIPT_LINE_WIDTH} chars for ${PAPER_WIDTH_MM}mm Sunmi paper). If it wraps early, reduce RECEIPT_LINE_WIDTH in constants/printerPaper.ts.`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Calibration print failed";
      Alert.alert("Print failed", message);
    } finally {
      setIsPrinting(false);
    }
  };

  const printerStatusLabel = printer.printerStatus ?? "Checking...";
  const dotColor = statusColor(
    printerStatusLabel,
    printer.connectionStatus,
    printer.connectionStatusColor
  );
  const deviceType = printer.deviceType ?? "UNKNOWN";

  const deviceLabel =
    deviceType === "SUNMI"
      ? "Sunmi V2s_GL"
      : deviceType === "NYX"
        ? "EzPump Handheld-POS"
        : "No printer detected";

  const sdkLabel =
    deviceType === "SUNMI"
      ? "Sunmi Inner Printer SDK (woyou.stu.sdkservice)"
      : deviceType === "NYX"
        ? "NYX Printer Service (net.nyx.printerservice)"
        : "Unknown SDK";

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
      <View
        style={{
          backgroundColor: colors.white,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: spacing.lg,
          marginBottom: spacing.lg,
        }}
      >
        <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>
          Connected Device
        </Text>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: spacing.sm }}>
          {deviceType === "UNKNOWN" ? "🔴" : "🟢"} {deviceLabel}
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18, marginBottom: spacing.md }}>
          SDK: {sdkLabel}
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18, marginBottom: spacing.md }}>
          Auto-detected on startup — no Bluetooth pairing or manual selection required.
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm }}>
          {isBusy ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: dotColor,
              }}
            />
          )}
          <Text style={{ fontSize: 14, fontWeight: "600", color: dotColor }}>
            {printer.connectionStatusLabel}
          </Text>
        </View>

        <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 4 }}>Printer status</Text>
        <Text style={{ fontSize: 15, fontWeight: "600", color: dotColor }}>{printerStatusLabel}</Text>
      </View>

      {printer.isInitializing ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            marginBottom: spacing.md,
            padding: spacing.md,
            backgroundColor: colors.primaryLight,
            borderRadius: 8,
          }}
        >
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={{ color: colors.primary, fontSize: 14 }}>Initializing printer...</Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleTestPrint}
        disabled={isBusy}
        style={{
          height: 48,
          backgroundColor: colors.primary,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.md,
          opacity: isBusy ? 0.7 : 1,
        }}
      >
        {isPrinting || printer.isTestingPrint ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={{ color: colors.white, fontSize: 16, fontWeight: "600" }}>Test Print</Text>
        )}
      </Pressable>

      <Pressable
        onPress={handleHelloWorldPrint}
        disabled={isBusy || deviceType !== "SUNMI"}
        style={{
          height: 44,
          backgroundColor: colors.white,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.md,
          opacity: isBusy || deviceType !== "SUNMI" ? 0.5 : 1,
        }}
      >
        <Text style={{ color: colors.muted, fontWeight: "600" }}>
          Hello World (AIDL test)
        </Text>
      </Pressable>

      <Pressable
        onPress={handleDiagnosticPrint}
        disabled={isBusy || deviceType !== "SUNMI"}
        style={{
          height: 44,
          backgroundColor: colors.white,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.md,
          opacity: isBusy || deviceType !== "SUNMI" ? 0.5 : 1,
        }}
      >
        <Text style={{ color: colors.muted, fontWeight: "600" }}>Diagnostic Print (Sunmi)</Text>
      </Pressable>

      <Pressable
        onPress={handleCalibrationPrint}
        disabled={isBusy}
        style={{
          height: 44,
          backgroundColor: colors.white,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.md,
          opacity: isBusy ? 0.7 : 1,
        }}
      >
        <Text style={{ color: colors.muted, fontWeight: "600" }}>
          Print width calibration ({RECEIPT_LINE_WIDTH} chars, {PAPER_WIDTH_MM}mm paper)
        </Text>
      </Pressable>

      <Pressable
        onPress={runInit}
        disabled={isBusy}
        style={{
          height: 44,
          backgroundColor: colors.white,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.lg,
          opacity: isBusy ? 0.7 : 1,
        }}
      >
        <Text style={{ color: colors.primary, fontWeight: "600" }}>Refresh printer status</Text>
      </Pressable>

      {printer.error ? (
        <View
          style={{
            backgroundColor: "#FEE2E2",
            padding: spacing.md,
            borderRadius: 8,
            marginBottom: spacing.md,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: spacing.sm,
          }}
        >
          <Text style={{ color: colors.error, fontSize: 14, flex: 1 }}>{printer.error}</Text>
          <DismissButton onPress={printer.dismissError} />
        </View>
      ) : null}
    </ScrollView>
  );
}
