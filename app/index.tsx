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
  Modal,
  ScrollView,
  Vibration,
} from "react-native";
import { useRouter, useNavigation } from "expo-router";
import { useFormState } from "../hooks/useFormState";
import { usePrinterContext } from "../contexts/PrinterContext";
import { Toast } from "../components/Toast";
import { colors, spacing } from "../constants/theme";
import { ReceiptData } from "../utils/generateReceipt";
import { formatCurrency } from "../utils/formatters";
import {
  startSlipSession,
  getCurrentSession,
  isSessionActive,
  incrementSlipCount,
} from "../src/services/SlipCounterService";
import {
  saveInvoice,
  formatSlipDateTime,
  productTypeToStorageKey,
} from "../src/services/InvoiceHistoryService";

const TOTAL_STEPS = 3;
const STEP_ANIM_MS = 150;
const FUEL_SELECT_DELAY_MS = 60;
const DUPLICATE_COUNTDOWN_SECONDS = 10;
const ADMIN_EMAIL = "admin@admin.com";
const ADMIN_PASSWORD = "admin@123";

const FUEL_OPTIONS = [
  { id: "Petrol", label: "PETROL", color: "#22c55e" },
  { id: "Diesel", label: "DIESEL", color: "#3b82f6" },
  { id: "Hi-Octane", label: "HI-OCTANE", color: "#a855f7" },
  { id: "Lubricants", label: "LUBRICANTS", color: "#f59e0b" },
  { id: "Car Service", label: "CAR SERVICE", color: "#ef4444" },
] as const;

type ProductId = (typeof FUEL_OPTIONS)[number]["id"];

const PRODUCT_BADGES: Record<
  ProductId,
  { backgroundColor: string; color: string }
> = {
  Petrol: { backgroundColor: "#dcfce7", color: "#16a34a" },
  Diesel: { backgroundColor: "#dbeafe", color: "#1d4ed8" },
  "Hi-Octane": { backgroundColor: "#f3e8ff", color: "#7e22ce" },
  Lubricants: { backgroundColor: "#fef3c7", color: "#d97706" },
  "Car Service": { backgroundColor: "#fee2e2", color: "#dc2626" },
};

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

function ProductBadge({ label, productId }: { label: string; productId: ProductId }) {
  const badge = PRODUCT_BADGES[productId];
  return (
    <View style={[styles.productBadge, { backgroundColor: badge.backgroundColor }]}>
      <Text style={[styles.productBadgeText, { color: badge.color }]}>{label}</Text>
    </View>
  );
}

function CountdownRing({ countdown, total }: { countdown: number; total: number }) {
  const progress = countdown / total;
  const ringColor = (segment: number) =>
    progress >= segment ? colors.primary : colors.border;

  return (
    <View style={styles.ringOuter}>
      <View
        style={[
          styles.ringProgress,
          {
            borderTopColor: ringColor(0.875),
            borderRightColor: ringColor(0.625),
            borderBottomColor: ringColor(0.375),
            borderLeftColor: ringColor(0.125),
          },
        ]}
      />
      <Text style={styles.countdownNumber}>{countdown}</Text>
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
  const [selectedProduct, setSelectedProduct] = useState<ProductId | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: "success" | "error" }>({
    visible: false,
    message: "",
    type: "success",
  });

  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicateCountdown, setDuplicateCountdown] = useState(DUPLICATE_COUNTDOWN_SECONDS);
  const [lastPrintData, setLastPrintData] = useState<ReceiptData | null>(null);
  const [isPrintingDuplicate, setIsPrintingDuplicate] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const contentOpacity = useRef(new Animated.Value(1)).current;
  const duplicateSlideAnim = useRef(new Animated.Value(0)).current;
  const closingDuplicate = useRef(false);
  const cardWidth = screenWidth * 0.85;

  const activeOption = FUEL_OPTIONS.find((o) => o.id === selectedProduct);

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
    (async () => {
      const active = await isSessionActive();
      setSessionActive(active);
      if (active) {
        const session = await getCurrentSession();
        setSessionCount(session?.count ?? 0);
      }
    })();
  }, []);

  useEffect(() => {
    if (!form.station.isHydrated) return;
    if (!form.station.isProfileComplete()) {
      router.replace("/settings?setup=1");
    }
  }, [
    form.station.isHydrated,
    form.station.stationName,
    form.station.stationAddress,
    form.station.fuelPrices.petrol,
    form.station.fuelPrices.diesel,
    form.station.fuelPrices.hiOctane,
    router,
  ]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: {
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      },
      headerTintColor: colors.primary,
      headerTitleStyle: {
        color: colors.black,
        fontSize: 18,
        fontWeight: "600",
      },
      headerRight: () => (
        <View style={styles.headerRight}>
          {sessionActive ? (
            <View style={styles.sessionPill}>
              <Text style={styles.sessionActiveIndicator}>Active ●</Text>
              {sessionCount > 0 ? (
                <Text style={styles.sessionCount}>{sessionCount}</Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.headerBadgeWrap}>
              <Ionicons name="print-outline" size={22} color={colors.muted} />
            </View>
          )}
          <Pressable onPress={() => setShowAdminLogin(true)} style={styles.headerIconBtn}>
            <Ionicons name="person-outline" size={22} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => router.push("/settings")} style={styles.headerIconBtn}>
            <Ionicons name="settings-outline" size={22} color={colors.primary} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, router, sessionActive, sessionCount]);

  const animateToStep = useCallback(
    (nextStep: number) => {
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: STEP_ANIM_MS,
        useNativeDriver: true,
      }).start(() => {
        setCurrentStep(nextStep);
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: STEP_ANIM_MS,
          useNativeDriver: true,
        }).start();
      });
    },
    [contentOpacity]
  );

  const goForward = useCallback(
    (nextStep: number) => animateToStep(nextStep),
    [animateToStep]
  );

  const goBack = useCallback(
    (prevStep: number) => animateToStep(prevStep),
    [animateToStep]
  );

  const resetSteps = useCallback(() => {
    setCurrentStep(1);
    setSelectedProduct(null);
    form.reset();
    setPrintSuccess(false);
    setDuplicateCountdown(DUPLICATE_COUNTDOWN_SECONDS);
    setLastPrintData(null);
  }, [form]);

  useEffect(() => {
    if (!showDuplicate) {
      closingDuplicate.current = false;
      return;
    }
    if (duplicateCountdown <= 0) {
      if (closingDuplicate.current) return;
      closingDuplicate.current = true;
      Animated.timing(duplicateSlideAnim, {
        toValue: screenWidth,
        duration: 300,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setShowDuplicate(false);
        duplicateSlideAnim.setValue(0);
        closingDuplicate.current = false;
        resetSteps();
      });
      return;
    }
    const timer = setTimeout(() => {
      setDuplicateCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [showDuplicate, duplicateCountdown, duplicateSlideAnim, screenWidth, resetSteps]);

  const handleStartCounter = useCallback(async () => {
    await startSlipSession();
    setSessionActive(true);
    setSessionCount(0);
  }, []);

  const handleAdminLogin = useCallback(() => {
    if (adminEmail === ADMIN_EMAIL && adminPassword === ADMIN_PASSWORD) {
      setShowAdminLogin(false);
      setAdminEmail("");
      setAdminPassword("");
      router.push("/admin");
    } else {
      Alert.alert("Invalid credentials");
    }
  }, [adminEmail, adminPassword, router]);

  const saveInvoiceFromReceipt = useCallback(
    async (receiptData: ReceiptData, isDuplicate: boolean) => {
      const isCarService = receiptData.productType === "Car Service";
      const isLubricants = receiptData.productType === "Lubricants";

      await saveInvoice({
        product: productTypeToStorageKey(receiptData.productType),
        volume: isCarService || isLubricants ? null : parseFloat(receiptData.volume),
        rate: isCarService
          ? null
          : isLubricants
            ? parseFloat(receiptData.fuelRate)
            : parseFloat(receiptData.fuelRate),
        totalAmount: isCarService ? 0 : receiptData.totalAmount,
        lubricantName: isLubricants ? receiptData.lubricantName : undefined,
        vehicleNo: receiptData.vehicleNumber || "",
        stationName: receiptData.stationName,
        address: receiptData.stationAddress,
        dateTime: formatSlipDateTime(),
        isDuplicate,
      });
    },
    []
  );

  const handleDuplicatePrint = useCallback(async () => {
    if (!lastPrintData) return;
    setIsPrintingDuplicate(true);
    try {
      try {
        await printer.ensureConnected();
      } catch {
        // Native printReceipt retries bind — continue even if JS check failed
      }
      await printer.printReceipt(lastPrintData, true);
      await saveInvoiceFromReceipt(lastPrintData, true);
      setShowDuplicate(false);
      resetSteps();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Print failed";
      Alert.alert("Print failed", msg);
    } finally {
      setIsPrintingDuplicate(false);
    }
  }, [lastPrintData, printer, resetSteps, saveInvoiceFromReceipt]);

  const handlePrint = useCallback(
    async () => {
      if (!form.station.isProfileComplete()) {
        Alert.alert("Station setup required", "Please complete your station profile in Settings first.");
        router.push("/settings?setup=1");
        return;
      }

      if (!form.validate()) {
        const msg =
          form.productType === "Lubricants"
            ? "Please enter lubricant name and price."
            : "Please check fuel rate and volume.";
        Alert.alert("Invalid input", msg);
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

        const count = await incrementSlipCount();
        if (count > 0) {
          setSessionCount(count);
        }

        await saveInvoiceFromReceipt(receiptData, false);

        setLastPrintData(receiptData);
        setDuplicateCountdown(DUPLICATE_COUNTDOWN_SECONDS);
        setShowDuplicate(true);
        setTimeout(() => setPrintSuccess(false), 800);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Print failed";
        Alert.alert("Print failed", msg);
      } finally {
        setIsPrinting(false);
      }
    },
    [form, printer, router, saveInvoiceFromReceipt]
  );

  const handleSelectProduct = useCallback(
    (productId: ProductId) => {
      setSelectedProduct(productId);
      form.setProductType(productId);

      if (productId === "Car Service") {
        form.updateFuelRate("");
        form.updateVolume("");
        setTimeout(() => goForward(3), FUEL_SELECT_DELAY_MS);
      } else if (productId === "Lubricants") {
        form.updateFuelRate("");
        form.updateVolume("");
        setTimeout(() => goForward(2), FUEL_SELECT_DELAY_MS);
      } else {
        form.updateFuelRate(form.station.getFuelPrice(productId));
        setTimeout(() => goForward(2), FUEL_SELECT_DELAY_MS);
      }
    },
    [form, goForward]
  );

  const handleBack = useCallback(() => {
    if (currentStep === 3 && selectedProduct === "Car Service") {
      goBack(1);
    } else {
      goBack(currentStep - 1);
    }
  }, [currentStep, selectedProduct, goBack]);

  const handlePrintPress = useCallback(() => {
    if (Platform.OS === "android") {
      Vibration.vibrate(10);
    }
    handlePrint();
  }, [handlePrint]);

  const lubricantReady =
    form.lubricantName.trim().length > 0 && form.lubricantPrice.trim().length > 0;
  const volumeReady = form.volume.trim().length > 0;
  const isCarService = selectedProduct === "Car Service";
  const isLubricants = selectedProduct === "Lubricants";

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

  const renderStepActions = () => {
    if (currentStep === 1 && selectedProduct) {
      return (
        <Pressable
          onPress={() => {
            if (selectedProduct === "Car Service") goForward(3);
            else goForward(2);
          }}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
        </Pressable>
      );
    }

    if (currentStep === 2) {
      const ready = isLubricants ? lubricantReady : volumeReady;
      return (
        <Pressable
          onPress={() => goForward(3)}
          disabled={!ready}
          style={[styles.primaryButton, !ready && styles.buttonDisabled]}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
        </Pressable>
      );
    }

    if (currentStep === 3) {
      return (
        <Pressable
          onPress={handlePrintPress}
          disabled={isPrinting || printer.isReconnecting}
          style={[
            styles.primaryButton,
            styles.printButton,
            (isPrinting || printer.isReconnecting) && styles.buttonDisabled,
          ]}
        >
          {isPrinting || printer.isReconnecting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.printButtonEmoji}>🖨️</Text>
          )}
          <Text style={styles.primaryButtonText}>
            {isPrinting || printer.isReconnecting ? "Printing..." : "Print Receipt"}
          </Text>
        </Pressable>
      );
    }

    return null;
  };

  const renderStepBody = () => {
    switch (currentStep) {
      case 1:
        return (
          <>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="water-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.cardTitle}>Select Product</Text>
                <Text style={styles.cardSubtitle}>Tap a fuel type to continue</Text>
              </View>
            </View>
            <View style={styles.productList}>
              {FUEL_OPTIONS.map((option) => {
                const isSelected = selectedProduct === option.id;
                const badge = PRODUCT_BADGES[option.id];
                const tintBg = `${option.color}18`;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => handleSelectProduct(option.id)}
                    style={[
                      styles.productRow,
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
                    <Text style={[styles.productLabel, { color: option.color }]}>
                      {option.label}
                    </Text>
                    {isSelected ? (
                      <View style={[styles.productBadge, { backgroundColor: badge.backgroundColor }]}>
                        <Ionicons name="checkmark" size={14} color={badge.color} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        );

      case 2:
        if (isLubricants) {
          return (
            <>
              {activeOption ? (
                <View style={styles.badgeCenter}>
                  <ProductBadge label={activeOption.label} productId={activeOption.id} />
                </View>
              ) : null}
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name="construct-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.cardTitle}>Lubricant Details</Text>
                  <Text style={styles.cardSubtitle}>Enter name and price</Text>
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>Lubricant Name</Text>
                <TextInput
                  style={styles.borderedInput}
                  value={form.lubricantName}
                  onChangeText={form.updateLubricantName}
                  placeholder="e.g. Engine Oil 5W-30"
                  placeholderTextColor={colors.muted}
                  autoFocus
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>Lubricant Price (PKR)</Text>
                <TextInput
                  style={styles.borderedInput}
                  value={form.lubricantPrice}
                  onChangeText={form.updateLubricantPrice}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                />
              </View>
            </>
          );
        }

        return (
          <>
            {activeOption ? (
              <View style={styles.badgeCenter}>
                <ProductBadge label={activeOption.label} productId={activeOption.id} />
              </View>
            ) : null}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="speedometer-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.cardTitle}>Litres Dispensed</Text>
                <Text style={styles.cardSubtitle}>Enter volume from pump</Text>
              </View>
            </View>
            <View style={styles.volumeInputRow}>
              <TextInput
                style={styles.volumeInput}
                value={form.volume}
                onChangeText={form.updateVolume}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                autoFocus
                selectionColor={colors.primary}
              />
              <Text style={styles.volumeSuffix}>LTR</Text>
            </View>
            <Text style={styles.rateHint}>
              Rate: {formatCurrency(parseFloat(form.fuelRate) || 0)} / ltr
            </Text>
          </>
        );

      case 3:
        return (
          <>
            {activeOption ? (
              <View style={styles.badgeCenter}>
                <ProductBadge label={activeOption.label} productId={activeOption.id} />
              </View>
            ) : null}

            <View style={styles.summaryCard}>
              <Text style={styles.summaryProduct}>
                {isLubricants && form.lubricantName.trim()
                  ? form.lubricantName.trim()
                  : activeOption?.label ?? form.productType.toUpperCase()}
              </Text>

              {!isCarService && !isLubricants ? (
                <Text style={styles.summaryMeta}>
                  {form.volume || "0"} LTR  •  {formatCurrency(parseFloat(form.fuelRate) || 0)}/ltr
                </Text>
              ) : null}

              {!isCarService ? (
                <Text style={styles.summaryTotal}>
                  {isLubricants
                    ? formatCurrency(parseFloat(form.lubricantPrice) || 0)
                    : form.totalDisplay}
                </Text>
              ) : null}
            </View>

            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="car-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.cardTitle}>Vehicle Number</Text>
                <Text style={styles.cardSubtitle}>Optional — tap Print to skip</Text>
              </View>
            </View>
            <View style={styles.fieldGroup}>
              <TextInput
                style={styles.vehicleInput}
                value={form.vehicleNumber}
                onChangeText={form.updateVehicleNumber}
                placeholder="e.g. ABC-428"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                autoFocus
                selectionColor={colors.primary}
              />
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
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {!sessionActive ? (
            <Pressable onPress={handleStartCounter} style={styles.startCounterBanner}>
              <Text style={styles.startCounterTitle}>Slip Counter</Text>
              <Text style={styles.startCounterText}>▶ Start Counter</Text>
            </Pressable>
          ) : null}

          <View style={styles.stepCard}>
            {currentStep > 1 ? (
              <Pressable onPress={handleBack} style={styles.backRow} hitSlop={12}>
                <Ionicons name="arrow-back" size={18} color={colors.primary} />
                <Text style={styles.backText}>Back</Text>
              </Pressable>
            ) : (
              <View style={styles.backSpacer} />
            )}

            <ProgressDots currentStep={currentStep} />
            <Text style={styles.stepLabel}>
              Step {currentStep} of {TOTAL_STEPS}
            </Text>

            <Animated.View style={{ opacity: contentOpacity }}>
              {renderStepBody()}
              {renderStepActions()}
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {printSuccess ? (
        <View style={styles.fullOverlay}>
          <Text style={styles.successText}>✓ Printed!</Text>
        </View>
      ) : null}

      {showDuplicate ? (
        <View style={styles.fullOverlay}>
          <Animated.View
            style={[
              styles.duplicateCard,
              { width: cardWidth, transform: [{ translateX: duplicateSlideAnim }] },
            ]}
          >
            <Text style={styles.duplicateTitle}>Print Duplicate?</Text>
            <CountdownRing countdown={duplicateCountdown} total={DUPLICATE_COUNTDOWN_SECONDS} />
            <Pressable
              onPress={handleDuplicatePrint}
              disabled={isPrintingDuplicate}
              style={[styles.primaryButton, isPrintingDuplicate && styles.buttonDisabled]}
            >
              <Text style={styles.primaryButtonText}>🖨️ Print Duplicate</Text>
            </Pressable>
            <Text style={styles.autoCloseText}>
              {isPrintingDuplicate
                ? "Printing duplicate..."
                : `Auto-closing in ${duplicateCountdown} seconds`}
            </Text>
          </Animated.View>
        </View>
      ) : null}

      <Modal visible={showAdminLogin} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>Admin Login</Text>
            <TextInput
              style={styles.loginInput}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              value={adminEmail}
              onChangeText={setAdminEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.loginInput}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              value={adminPassword}
              onChangeText={setAdminPassword}
              secureTextEntry
            />
            <Pressable onPress={handleAdminLogin} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Login</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowAdminLogin(false);
                setAdminEmail("");
                setAdminPassword("");
              }}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  startCounterBanner: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  startCounterTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
  },
  startCounterText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  stepCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.lg,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 4,
  },
  headerIconBtn: {
    padding: 8,
  },
  headerBadgeWrap: {
    padding: 4,
    marginRight: 4,
  },
  sessionPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    gap: 6,
  },
  sessionActiveIndicator: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "600",
  },
  sessionCount: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "700",
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    gap: 4,
  },
  backSpacer: {
    height: 28,
  },
  backText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  progressDots: {
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.md,
    justifyContent: "center",
  },
  dot: {
    borderRadius: 4,
  },
  dotFilled: {
    width: 24,
    height: 8,
    backgroundColor: colors.primary,
  },
  dotEmpty: {
    width: 8,
    height: 8,
    backgroundColor: colors.border,
  },
  stepLabel: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginBottom: spacing.lg,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  sectionHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.black,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  productList: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  productRow: {
    height: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  productLabel: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  productBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  productBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  badgeCenter: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.black,
    marginBottom: 6,
  },
  borderedInput: {
    height: 44,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    color: colors.black,
  },
  volumeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingVertical: spacing.sm,
  },
  volumeInput: {
    fontSize: 40,
    fontWeight: "700",
    textAlign: "center",
    color: colors.black,
    minWidth: 120,
    paddingVertical: spacing.sm,
  },
  volumeSuffix: {
    fontSize: 24,
    color: colors.muted,
    fontWeight: "600",
    marginLeft: spacing.sm,
  },
  rateHint: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  summaryCard: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.sm,
  },
  summaryProduct: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.black,
    textAlign: "center",
  },
  summaryMeta: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
  summaryTotal: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.primary,
    textAlign: "center",
  },
  vehicleInput: {
    height: 44,
    fontSize: 18,
    fontWeight: "600",
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    color: colors.black,
    textTransform: "uppercase",
  },
  primaryButton: {
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  printButton: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  printButtonEmoji: {
    fontSize: 18,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  successText: {
    color: colors.success,
    fontSize: 24,
    fontWeight: "700",
  },
  ringOuter: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  ringProgress: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 8,
  },
  countdownNumber: {
    fontSize: 48,
    fontWeight: "700",
    color: colors.primary,
  },
  duplicateCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  duplicateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.black,
    marginBottom: spacing.lg,
  },
  autoCloseText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  loginCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.lg,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loginTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.black,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  loginInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: spacing.md,
    color: colors.black,
    backgroundColor: colors.white,
  },
  cancelButton: {
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  cancelButtonText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
  },
});
