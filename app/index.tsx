import React, { useState, useCallback, useLayoutEffect, useEffect, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  NativeModules,
  TextInput,
  Animated,
  Easing,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useRouter, useNavigation } from "expo-router";
import { useFormState } from "../hooks/useFormState";
import { usePrinterContext } from "../contexts/PrinterContext";
// import { PrinterStatus } from "../components/PrinterStatus";
import { Toast } from "../components/Toast";
// import { ReceiptPreviewScreen } from "../src/screens/ReceiptPreviewScreen";
import { colors } from "../constants/theme";

const TOTAL_STEPS = 4;
const STEP_ANIM_MS = 100;
const FUEL_SELECT_DELAY_MS = 60;

const FUEL_OPTIONS = [
  { id: "Petrol", label: "PETROL", color: "#22c55e" },
  { id: "Diesel", label: "DIESEL", color: "#3b82f6" },
  { id: "Hi-Octane", label: "HI-OCTANE", color: "#a855f7" },
] as const;

type FuelId = (typeof FUEL_OPTIONS)[number]["id"];

function ProgressDots({ currentStep }: { currentStep: number }) {
  return (
    <View style={styles.progressDots}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const stepNum = i + 1;
        const filled = stepNum <= currentStep;
        return (
          <View
            key={stepNum}
            style={[styles.dot, filled ? styles.dotFilled : styles.dotEmpty]}
          />
        );
      })}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const printer = usePrinterContext();
  const form = useFormState();
  const { width: screenWidth } = useWindowDimensions();

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<FuelId | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: "success" | "error" }>({
    visible: false,
    message: "",
    type: "success",
  });

  const slideAnim = useRef(new Animated.Value(0)).current;
  const cardWidth = screenWidth * 0.85;

  const hideToast = useCallback(() => {
    setToast((t) => ({ ...t, visible: false }));
  }, []);

  useEffect(() => {
    console.log(
      "PRINTER MODULES:",
      JSON.stringify(
        Object.keys(NativeModules).filter((k) => k.toLowerCase().includes("sunmi"))
      )
    );
  }, []);

  useEffect(() => {
    if (!form.station.isHydrated) return;
    if (!form.station.isProfileComplete()) {
      router.replace("/settings?setup=1");
    }
  }, [form.station.isHydrated, form.station.stationName, form.station.stationAddress, router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={() => router.push("/settings")} style={{ padding: 8, marginRight: 4 }}>
            <Ionicons name="settings-outline" size={24} color={colors.primary} />
          </Pressable>
          {/* Printer status icon hidden for now
          <PrinterStatus
            connected={printer.connectionStatus === "connected"}
            connectionStatus={printer.connectionStatus}
            connectionStatusLabel={printer.connectionStatusLabel}
            printerName={printer.connectedDevice?.name}
            onPress={() => router.push("/printer-setup")}
          />
          */}
        </View>
      ),
    });
  }, [navigation, printer.connectedDevice, printer.connectionStatus, printer.connectionStatusLabel, router]);

  const animateToStep = useCallback(
    (nextStep: number, direction: "forward" | "back") => {
      const travel = screenWidth * 0.15;
      const exitTo = direction === "forward" ? -travel : travel;
      const enterFrom = direction === "forward" ? travel : -travel;
      const easing = Easing.out(Easing.cubic);

      Animated.timing(slideAnim, {
        toValue: exitTo,
        duration: STEP_ANIM_MS,
        easing,
        useNativeDriver: true,
      }).start(() => {
        setCurrentStep(nextStep);
        slideAnim.setValue(enterFrom);
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: STEP_ANIM_MS,
          easing,
          useNativeDriver: true,
        }).start();
      });
    },
    [slideAnim, screenWidth]
  );

  const goForward = useCallback(
    (nextStep: number) => animateToStep(nextStep, "forward"),
    [animateToStep]
  );

  const goBack = useCallback(
    (prevStep: number) => animateToStep(prevStep, "back"),
    [animateToStep]
  );

  const resetForm = useCallback(() => {
    setCurrentStep(1);
    setSelectedProduct(null);
    form.updateFuelRate("");
    form.updateVolume("");
    form.updateVehicleNumber("");
    setPrintSuccess(false);
  }, [form]);

  const handlePrint = useCallback(
    async (vehicleNo: string) => {
      if (!form.station.isProfileComplete()) {
        Alert.alert("Station setup required", "Please complete your station profile in Settings first.");
        router.push("/settings?setup=1");
        return;
      }

      form.updateVehicleNumber(vehicleNo);
      if (!form.validate()) {
        Alert.alert("Invalid input", "Please check fuel rate and volume.");
        return;
      }

      setIsPrinting(true);
      try {
        try {
          await printer.ensureConnected();
        } catch {
          // Native printReceipt retries bind — continue even if JS check failed
        }

        const receiptData = form.getReceiptData();
        await printer.printReceipt(receiptData);
        setPrintSuccess(true);
        setTimeout(() => {
          resetForm();
        }, 1500);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Print failed";
        Alert.alert("Print failed", msg);
      } finally {
        setIsPrinting(false);
      }
    },
    [form, printer, resetForm, router]
  );

  const handleSelectFuel = useCallback(
    (fuelId: FuelId) => {
      setSelectedProduct(fuelId);
      form.setProductType(fuelId);
      setTimeout(() => goForward(2), FUEL_SELECT_DELAY_MS);
    },
    [form, goForward]
  );

  if (!form.station.isHydrated) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!form.station.isProfileComplete()) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <>
            <Text style={styles.cardTitle}>Select Fuel Type</Text>
            <View style={{ marginTop: 8 }}>
              {FUEL_OPTIONS.map((option) => {
                const isSelected = selectedProduct === option.id;
                const tintBg = `${option.color}18`;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => handleSelectFuel(option.id)}
                    style={[
                      styles.fuelRow,
                      isSelected && {
                        borderColor: option.color,
                        backgroundColor: tintBg,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.radioOuter,
                        isSelected && { borderColor: option.color },
                      ]}
                    >
                      {isSelected ? (
                        <View style={[styles.radioInner, { backgroundColor: option.color }]} />
                      ) : null}
                    </View>
                    <Text style={[styles.fuelLabel, { color: option.color }]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        );

      case 2:
        return (
          <>
            <Text style={styles.cardTitle}>Rate per Litre</Text>
            <Text style={styles.cardSubtitle}>Enter current fuel rate</Text>
            <View style={styles.rateInputRow}>
              <Text style={styles.ratePrefix}>Rs.</Text>
              <TextInput
                style={styles.numberInput}
                value={form.fuelRate}
                onChangeText={form.updateFuelRate}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                autoFocus
              />
            </View>
            <Pressable
              onPress={() => goForward(3)}
              disabled={!form.fuelRate.trim()}
              style={[styles.nextButton, !form.fuelRate.trim() && styles.buttonDisabled]}
            >
              <Text style={styles.nextButtonText}>Next →</Text>
            </Pressable>
          </>
        );

      case 3:
        return (
          <>
            <Text style={styles.cardTitle}>Litres Dispensed</Text>
            <Text style={styles.cardSubtitle}>Enter volume from pump</Text>
            <View style={styles.volumeInputRow}>
              <TextInput
                style={[styles.numberInput, { flex: 1 }]}
                value={form.volume}
                onChangeText={form.updateVolume}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                autoFocus
              />
              <Text style={styles.volumeSuffix}>LTR</Text>
            </View>
            <Pressable
              onPress={() => goForward(4)}
              disabled={!form.volume.trim()}
              style={[styles.nextButton, !form.volume.trim() && styles.buttonDisabled]}
            >
              <Text style={styles.nextButtonText}>Next →</Text>
            </Pressable>
          </>
        );

      case 4:
        return (
          <>
            <Text style={styles.cardTitle}>Vehicle Number</Text>
            <Text style={styles.cardSubtitle}>Optional - tap Skip to print</Text>
            <TextInput
              style={[styles.numberInput, { marginBottom: 24 }]}
              value={form.vehicleNumber}
              onChangeText={form.updateVehicleNumber}
              placeholder="e.g. ASX-428"
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              autoFocus
            />
            <View style={styles.printButtonRow}>
              <Pressable
                onPress={() => handlePrint("")}
                disabled={isPrinting || printer.isReconnecting}
                style={[
                  styles.skipButton,
                  (isPrinting || printer.isReconnecting) && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.skipButtonText}>Skip & Print</Text>
              </Pressable>
              <Pressable
                onPress={() => handlePrint(form.vehicleNumber)}
                disabled={isPrinting || printer.isReconnecting}
                style={[
                  styles.confirmButton,
                  (isPrinting || printer.isReconnecting) && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.confirmButtonText}>Confirm & Print</Text>
              </Pressable>
            </View>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View
          style={[
            styles.card,
            { width: cardWidth, transform: [{ translateX: slideAnim }] },
          ]}
        >
          {currentStep > 1 ? (
            <Pressable
              onPress={() => goBack(currentStep - 1)}
              style={styles.backButton}
              hitSlop={8}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </Pressable>
          ) : (
            <View style={styles.backButtonPlaceholder} />
          )}

          <ProgressDots currentStep={currentStep} />
          <Text style={styles.stepIndicator}>
            Step {currentStep} of {TOTAL_STEPS}
          </Text>

          {renderStepContent()}
        </Animated.View>
      </KeyboardAvoidingView>

      {isPrinting ? (
        <View style={styles.fullOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.overlayText}>Printing...</Text>
        </View>
      ) : null}

      {printSuccess ? (
        <View style={styles.fullOverlay}>
          <Text style={styles.successText}>✓ Printed!</Text>
        </View>
      ) : null}

      {/* Receipt preview skipped — print fires directly from Step 4
      <ReceiptPreviewScreen
        visible={showPreview}
        data={previewData}
        isPrinting={isPrinting}
        onPrint={handleConfirmPrint}
        onCancel={() => {
          if (!isPrinting) setShowPreview(false);
        }}
      />
      */}

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  backButton: {
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  backButtonPlaceholder: {
    height: 24,
    marginBottom: 8,
  },
  backButtonText: {
    fontSize: 14,
    color: "#1a56db",
    fontWeight: "500",
  },
  progressDots: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
    justifyContent: "center",
  },
  dot: {
    borderRadius: 4,
  },
  dotFilled: {
    width: 24,
    height: 8,
    backgroundColor: "#1a56db",
  },
  dotEmpty: {
    width: 8,
    height: 8,
    backgroundColor: "#d1d5db",
  },
  stepIndicator: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 8,
    textAlign: "center",
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
    textAlign: "center",
  },
  fuelRow: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    marginBottom: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  fuelLabel: {
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  rateInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: "#1a56db",
    paddingVertical: 8,
  },
  ratePrefix: {
    fontSize: 32,
    color: "#1a1a2e",
    fontWeight: "600",
    marginRight: 8,
  },
  volumeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: "#1a56db",
    paddingVertical: 8,
  },
  volumeSuffix: {
    fontSize: 32,
    color: "#1a1a2e",
    fontWeight: "600",
    marginLeft: 8,
  },
  numberInput: {
    fontSize: 32,
    textAlign: "center",
    color: "#1a1a2e",
    flex: 1,
    paddingVertical: 8,
  },
  nextButton: {
    backgroundColor: "#1a56db",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    alignItems: "center",
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  printButtonRow: {
    flexDirection: "row",
    gap: 12,
  },
  skipButton: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  skipButtonText: {
    color: "#374151",
    fontSize: 15,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    backgroundColor: "#1a56db",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  overlayText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "500",
  },
  successText: {
    color: "#22c55e",
    fontSize: 24,
    fontWeight: "700",
  },
});
