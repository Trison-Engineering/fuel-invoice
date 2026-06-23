import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePrinterContext } from "../contexts/PrinterContext";
import { PAPER_WIDTH_MM, RECEIPT_LINE_WIDTH } from "../constants/printerPaper";
import { Colors, Typography, Radius, Spacing, Shadow, Buttons } from "../constants/theme";

function DismissButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityLabel="Dismiss"
      style={({ pressed }) => [styles.dismissButton, pressed && styles.dismissButtonPressed]}
    >
      <Ionicons name="close" size={20} color={Colors.text.tertiary} />
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
  if (status === "Normal") return Colors.text.success;
  if (status === "Out of paper") return Colors.text.danger;
  return Colors.text.danger;
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export default function PrinterSetupScreen() {
  const printer = usePrinterContext();
  const insets = useSafeAreaInsets();
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
      Alert.alert("Print complete", "Test receipt sent to the Sunmi built-in printer.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Test print failed";
      Alert.alert("Print failed", message);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleHelloWorldPrint = async () => {
    setIsPrinting(true);
    try {
      await printer.printHelloWorld();
      Alert.alert("Hello World", "RAW ESC/POS test sent to the printer.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Hello World print failed";
      Alert.alert("Print failed", message);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDiagnosticPrint = async () => {
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
  const isConnected =
    printer.connectionStatus === "connected" || printer.connectionStatus === "warming_up";

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + Spacing.xl, paddingBottom: Math.max(insets.bottom, 32) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.pageTitle}>Printer Setup</Text>

      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isConnected ? Colors.text.success : Colors.text.danger },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              { color: isConnected ? Colors.text.success : Colors.text.danger },
            ]}
          >
            {isConnected ? "Printer Connected" : "Not Connected"}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Printer</Text>
          <Text style={styles.infoValue}>Sunmi V2s_GL</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>SDK</Text>
          <Text style={styles.infoValueMono}>woyou.aidlservice.jiuiv5</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Status</Text>
          <Text style={[styles.infoValue, { color: dotColor }]}>{printerStatusLabel}</Text>
        </View>

        <Text style={styles.statusHint}>
          Auto-detected on startup — no Bluetooth pairing required.
        </Text>
      </View>

      {printer.isInitializing ? (
        <View style={styles.initBanner}>
          <ActivityIndicator color={Colors.accent} size="small" />
          <Text style={styles.initBannerText}>Initializing printer...</Text>
        </View>
      ) : null}

      <SectionLabel>SELECT DEVICE</SectionLabel>
      <View style={styles.deviceGroup}>
        <View style={styles.deviceRowSelected}>
          <View style={styles.deviceRowContent}>
            <Text style={styles.deviceName}>Sunmi V2s_GL</Text>
            <Text style={styles.deviceSubtext}>Built-in thermal printer</Text>
          </View>
          <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />
        </View>
      </View>

      <Pressable
        onPress={handleTestPrint}
        disabled={isBusy}
        style={({ pressed }) => [
          styles.connectButton,
          isBusy && styles.connectButtonLoading,
          pressed && !isBusy && styles.connectButtonPressed,
        ]}
      >
        {isPrinting || printer.isTestingPrint ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.connectButtonText}>Printing...</Text>
          </View>
        ) : (
          <Text style={styles.connectButtonText}>Test Print</Text>
        )}
      </Pressable>

      <Pressable
        onPress={handleHelloWorldPrint}
        disabled={isBusy}
        style={({ pressed }) => [
          styles.secondaryButton,
          isBusy && styles.buttonDisabled,
          pressed && styles.secondaryButtonPressed,
        ]}
      >
        <Text style={styles.secondaryButtonText}>Hello World (RAW test)</Text>
      </Pressable>

      <Pressable
        onPress={handleDiagnosticPrint}
        disabled={isBusy}
        style={({ pressed }) => [
          styles.secondaryButton,
          isBusy && styles.buttonDisabled,
          pressed && styles.secondaryButtonPressed,
        ]}
      >
        <Text style={styles.secondaryButtonText}>Diagnostic Print</Text>
      </Pressable>

      <Pressable
        onPress={handleCalibrationPrint}
        disabled={isBusy}
        style={({ pressed }) => [
          styles.secondaryButton,
          isBusy && styles.buttonDisabled,
          pressed && styles.secondaryButtonPressed,
        ]}
      >
        <Text style={styles.secondaryButtonText}>
          Print width calibration ({RECEIPT_LINE_WIDTH} chars, {PAPER_WIDTH_MM}mm paper)
        </Text>
      </Pressable>

      <Pressable
        onPress={runInit}
        disabled={isBusy}
        style={({ pressed }) => [
          styles.outlineButton,
          isBusy && styles.buttonDisabled,
          pressed && styles.outlineButtonPressed,
        ]}
      >
        <Text style={styles.outlineButtonText}>Refresh printer status</Text>
      </Pressable>

      {printer.error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{printer.error}</Text>
          <DismissButton onPress={printer.dismissError} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
  },
  pageTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
    marginBottom: Spacing.lg,
  },
  statusCard: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  infoRow: {
    marginBottom: Spacing.sm,
  },
  infoLabel: {
    fontSize: Typography.sm,
    color: Colors.text.tertiary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
  },
  infoValueMono: {
    fontSize: Typography.sm,
    color: Colors.text.secondary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  statusHint: {
    fontSize: Typography.sm,
    color: Colors.text.tertiary,
    lineHeight: 18,
    marginTop: Spacing.sm,
  },
  initBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.accentAlpha,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border.accent,
  },
  initBannerText: {
    color: Colors.text.accent,
    fontSize: Typography.sm,
  },
  sectionLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.text.tertiary,
    letterSpacing: Typography.widest,
    textTransform: "uppercase",
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  deviceGroup: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  deviceRowSelected: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.accentAlpha,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  deviceRowContent: {
    flex: 1,
  },
  deviceName: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.text.primary,
  },
  deviceSubtext: {
    fontSize: Typography.xs,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  connectButton: {
    ...Buttons.primary,
    height: 52,
    marginBottom: Spacing.md,
  },
  connectButtonPressed: {
    ...Buttons.primaryPressed,
  },
  connectButtonText: {
    ...Buttons.primaryText,
    fontSize: Typography.base,
  },
  loadingRow: {
    ...Buttons.loadingRow,
  },
  secondaryButton: {
    ...Buttons.secondary,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  secondaryButtonPressed: {
    ...Buttons.secondaryPressed,
  },
  secondaryButtonText: {
    ...Buttons.secondaryText,
    fontSize: Typography.sm,
    textAlign: "center",
  },
  outlineButton: {
    ...Buttons.accentOutlineGhost,
    marginBottom: Spacing.lg,
  },
  outlineButtonPressed: {
    ...Buttons.secondaryPressed,
  },
  outlineButtonText: {
    ...Buttons.accentOutlineGhostText,
    fontSize: Typography.sm,
  },
  connectButtonLoading: {
    ...Buttons.primaryLoading,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  errorBanner: {
    backgroundColor: "rgba(239,68,68,0.12)",
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  errorText: {
    color: Colors.text.danger,
    fontSize: Typography.sm,
    flex: 1,
  },
  dismissButton: {
    ...Buttons.icon,
  },
  dismissButtonPressed: {
    ...Buttons.iconPressed,
  },
});
