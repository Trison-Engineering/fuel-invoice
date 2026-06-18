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
  Vibration,
} from "react-native";
import { useRouter, useNavigation } from "expo-router";
import { useFormState } from "../hooks/useFormState";
import { usePrinterContext } from "../contexts/PrinterContext";
import { Toast } from "../components/Toast";
import { colors } from "../constants/theme";
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

const BG = "#0A0F1E";
const TEXT_PRIMARY = "#FFFFFF";
const TEXT_SECONDARY = "#5A6478";
const ACCENT = "#3B82F6";
const ICON_MUTED = "#8B9BB4";
const PLACEHOLDER = "#3A4258";

const FUEL_OPTIONS = [
  { id: "Petrol", label: "PETROL", color: "#22C55E", initial: "P" },
  { id: "Diesel", label: "DIESEL", color: "#3B82F6", initial: "D" },
  { id: "Hi-Octane", label: "HI-OCTANE", color: "#A855F7", initial: "H" },
  { id: "Lubricants", label: "LUBRICANTS", color: "#F59E0B", initial: "L" },
  { id: "Car Service", label: "CAR SERVICE", color: "#EF4444", initial: "C" },
] as const;

type ProductId = (typeof FUEL_OPTIONS)[number]["id"];

function ProgressBar({
  progress,
  width,
}: {
  progress: Animated.Value;
  width: number;
}) {
  const fillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width],
  });

  return (
    <View style={[styles.progressTrack, { width }]}>
      <Animated.View style={[styles.progressFill, { width: fillWidth }]} />
    </View>
  );
}

function ProductPill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.productPill, { backgroundColor: `${color}26` }]}>
      <View style={[styles.productPillDot, { backgroundColor: color }]} />
      <Text style={[styles.productPillText, { color }]}>{label}</Text>
    </View>
  );
}

function CountdownRing({ countdown, total }: { countdown: number; total: number }) {
  const progress = countdown / total;
  const ringColor = (segment: number) => (progress >= segment ? ACCENT : "rgba(255,255,255,0.12)");

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
  const progressAnim = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;
  const continueBtnAnim = useRef(new Animated.Value(0)).current;
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

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: currentStep / TOTAL_STEPS,
      duration: 300,
      easing: Easing.ease,
      useNativeDriver: false,
    }).start();
  }, [currentStep, progressAnim]);

  useEffect(() => {
    if (selectedProduct && currentStep === 1) {
      Animated.spring(continueBtnAnim, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      continueBtnAnim.setValue(0);
    }
  }, [selectedProduct, currentStep, continueBtnAnim]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: {
        backgroundColor: BG,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.06)",
      },
      headerTintColor: TEXT_PRIMARY,
      headerTitleStyle: {
        color: TEXT_PRIMARY,
        fontSize: 18,
        fontWeight: "600",
      },
      headerRight: () => (
        <View style={styles.headerRight}>
          {sessionActive ? (
            <View style={styles.sessionPill}>
              <View style={styles.sessionPillDot} />
              <Text style={styles.sessionPillText}>Active</Text>
              {sessionCount > 0 ? (
                <Text style={styles.sessionPillCount}>{sessionCount}</Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.headerBadgeWrap}>
              <Ionicons name="print-outline" size={22} color={ICON_MUTED} />
            </View>
          )}
          <Pressable onPress={() => setShowAdminLogin(true)} style={styles.headerIconBtn}>
            <Ionicons name="person-outline" size={22} color={ICON_MUTED} />
          </Pressable>
          <Pressable onPress={() => router.push("/settings")} style={styles.headerIconBtn}>
            <Ionicons name="settings-outline" size={22} color={ICON_MUTED} />
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
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  if (!form.station.isProfileComplete()) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  const renderStepBody = () => {
    switch (currentStep) {
      case 1:
        return (
          <View style={styles.productList}>
            {FUEL_OPTIONS.map((option, index) => {
              const isSelected = selectedProduct === option.id;
              return (
                <React.Fragment key={option.id}>
                  {index > 0 ? <View style={styles.rowSeparator} /> : null}
                  <Pressable
                    onPress={() => handleSelectProduct(option.id)}
                    style={[
                      styles.productRow,
                      isSelected && { backgroundColor: "rgba(59,130,246,0.08)" },
                    ]}
                  >
                    <View
                      style={[
                        styles.productCircle,
                        {
                          backgroundColor: isSelected ? option.color : "rgba(255,255,255,0.08)",
                          borderColor: isSelected ? option.color : "rgba(255,255,255,0.12)",
                        },
                        isSelected && styles.productCircleSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.productInitial,
                          { color: isSelected ? TEXT_PRIMARY : TEXT_SECONDARY },
                        ]}
                      >
                        {option.initial}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.productName,
                        isSelected && { color: option.color },
                      ]}
                    >
                      {option.label}
                    </Text>
                    {isSelected ? (
                      <View style={styles.checkCircle}>
                        <Ionicons name="checkmark" size={16} color={TEXT_PRIMARY} />
                      </View>
                    ) : (
                      <View style={styles.checkPlaceholder} />
                    )}
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>
        );

      case 2:
        if (isLubricants) {
          return (
            <View style={styles.lubricantStep}>
              {activeOption ? (
                <View style={styles.pillWrap}>
                  <ProductPill label={activeOption.label} color={activeOption.color} />
                </View>
              ) : null}
              <View style={styles.lubricantFields}>
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>Lubricant Name</Text>
                  <TextInput
                    style={styles.underlineInput}
                    value={form.lubricantName}
                    onChangeText={form.updateLubricantName}
                    placeholder="e.g. Engine Oil 5W-30"
                    placeholderTextColor={PLACEHOLDER}
                    autoFocus
                  />
                </View>
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>Lubricant Price (PKR)</Text>
                  <TextInput
                    style={styles.underlineInput}
                    value={form.lubricantPrice}
                    onChangeText={form.updateLubricantPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={PLACEHOLDER}
                  />
                </View>
              </View>
            </View>
          );
        }

        return (
          <View style={styles.volumeStep}>
            {activeOption ? (
              <View style={styles.pillWrap}>
                <ProductPill label={activeOption.label} color={activeOption.color} />
              </View>
            ) : null}
            <View style={styles.volumeCenter}>
              <View style={styles.volumeInputRow}>
                <TextInput
                  style={styles.hugeInput}
                  value={form.volume}
                  onChangeText={form.updateVolume}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={PLACEHOLDER}
                  autoFocus
                  selectionColor={ACCENT}
                />
                <Text style={styles.ltrLabel}>LTR</Text>
              </View>
              <View style={styles.accentLine} />
              <Text style={styles.rateHint}>
                Rate: PKR {form.fuelRate || "0.00"} / ltr
              </Text>
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.summaryStep}>
            {activeOption ? (
              <View style={styles.pillWrap}>
                <ProductPill label={activeOption.label} color={activeOption.color} />
              </View>
            ) : null}

            <View style={styles.summaryBlock}>
              <Text style={styles.summaryProduct}>
                {isLubricants && form.lubricantName.trim()
                  ? form.lubricantName.trim()
                  : activeOption?.label ?? form.productType.toUpperCase()}
              </Text>

              {!isCarService && !isLubricants ? (
                <Text style={styles.summaryMeta}>
                  {form.volume || "0"} LTR  •  PKR {form.fuelRate || "0"}/ltr
                </Text>
              ) : null}

              {!isCarService ? (
                <Text style={styles.summaryTotal}>
                  PKR{" "}
                  {isLubricants
                    ? formatCurrency(parseFloat(form.lubricantPrice) || 0)
                    : form.totalDisplay}
                </Text>
              ) : null}
            </View>

            <View style={styles.summaryDivider} />

            <Text style={styles.vehicleLabel}>VEHICLE NUMBER</Text>
            <TextInput
              style={styles.vehicleInput}
              value={form.vehicleNumber}
              onChangeText={form.updateVehicleNumber}
              placeholder="e.g. ABC-428"
              placeholderTextColor={PLACEHOLDER}
              autoCapitalize="characters"
              autoFocus
              selectionColor={ACCENT}
            />
            <Text style={styles.vehicleHint}>Optional — tap Print to skip</Text>
          </View>
        );

      default:
        return null;
    }
  };

  const renderStepHeading = () => {
    if (currentStep === 1) {
      return (
        <>
          <Text style={styles.heading}>What are you{"\n"}dispensing?</Text>
          <Text style={styles.subheading}>Tap to select</Text>
        </>
      );
    }
    return null;
  };

  const showContinueStep1 = currentStep === 1 && selectedProduct !== null;
  const showContinueStep2 =
    currentStep === 2 && (isLubricants ? lubricantReady : volumeReady);

  const continueTranslate = continueBtnAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });

  return (
    <View style={styles.root}>
      <ProgressBar progress={progressAnim} width={screenWidth} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {!sessionActive ? (
          <Pressable onPress={handleStartCounter} style={styles.startCounterButton}>
            <Text style={styles.startCounterText}>▶ Start Counter</Text>
          </Pressable>
        ) : null}

        {currentStep > 1 ? (
          <Pressable onPress={handleBack} style={styles.backRow} hitSlop={12}>
            <Ionicons name="arrow-back" size={18} color={TEXT_SECONDARY} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}

        <Animated.View style={[styles.stepContent, { opacity: contentOpacity }]}>
          <Text style={styles.stepLabel}>
            STEP {currentStep} OF {TOTAL_STEPS}
          </Text>
          {renderStepHeading()}
          {renderStepBody()}
        </Animated.View>

        {showContinueStep1 ? (
          <Animated.View
            style={[
              styles.floatingBtnWrap,
              {
                opacity: continueBtnAnim,
                transform: [{ translateY: continueTranslate }],
              },
            ]}
          >
            <Pressable
              onPress={() => {
                if (selectedProduct === "Car Service") goForward(3);
                else goForward(2);
              }}
              style={styles.floatingBtn}
            >
              <Text style={styles.floatingBtnText}>Continue</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {showContinueStep2 ? (
          <View style={styles.floatingBtnWrap}>
            <Pressable onPress={() => goForward(3)} style={styles.floatingBtn}>
              <Text style={styles.floatingBtnText}>Continue</Text>
            </Pressable>
          </View>
        ) : null}

        {currentStep === 2 && !showContinueStep2 ? (
          <View style={styles.floatingBtnWrap}>
            <Pressable disabled style={[styles.floatingBtn, styles.floatingBtnDisabled]}>
              <Text style={styles.floatingBtnText}>Continue</Text>
            </Pressable>
          </View>
        ) : null}

        {currentStep === 3 ? (
          <View style={styles.floatingBtnWrap}>
            <Pressable
              onPress={handlePrintPress}
              disabled={isPrinting || printer.isReconnecting}
              style={[
                styles.printBtn,
                (isPrinting || printer.isReconnecting) && styles.printBtnLoading,
              ]}
            >
              {isPrinting || printer.isReconnecting ? (
                <ActivityIndicator size="small" color={TEXT_PRIMARY} />
              ) : (
                <Text style={styles.printIcon}>🖨️</Text>
              )}
              <Text style={styles.floatingBtnText}>
                {isPrinting || printer.isReconnecting ? "Printing..." : "Print Receipt"}
              </Text>
            </Pressable>
          </View>
        ) : null}
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
              style={[styles.duplicateButton, isPrintingDuplicate && styles.buttonDisabled]}
            >
              <Text style={styles.duplicateButtonText}>🖨️ Print Duplicate</Text>
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
              placeholderTextColor="#9ca3af"
              value={adminEmail}
              onChangeText={setAdminEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.loginInput}
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              value={adminPassword}
              onChangeText={setAdminPassword}
              secureTextEntry
            />
            <Pressable onPress={handleAdminLogin} style={styles.loginButton}>
              <Text style={styles.loginButtonText}>Login</Text>
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
    backgroundColor: BG,
  },
  flex: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: BG,
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  progressFill: {
    height: 3,
    backgroundColor: ACCENT,
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
    backgroundColor: "rgba(34,197,94,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    gap: 6,
  },
  sessionPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  sessionPillText: {
    color: "#22C55E",
    fontSize: 12,
    fontWeight: "600",
  },
  sessionPillCount: {
    color: "#22C55E",
    fontSize: 11,
    fontWeight: "700",
  },
  startCounterButton: {
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  startCounterText: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: "600",
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 6,
  },
  backSpacer: {
    height: 36,
  },
  backText: {
    color: TEXT_SECONDARY,
    fontSize: 15,
  },
  stepContent: {
    flex: 1,
    paddingBottom: 100,
  },
  stepLabel: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 11,
    letterSpacing: 2,
    color: TEXT_SECONDARY,
    textTransform: "uppercase",
  },
  heading: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 32,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    lineHeight: 40,
  },
  subheading: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 24,
  },
  productList: {
    marginTop: 8,
  },
  productRow: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  rowSeparator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginHorizontal: 24,
  },
  productCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  productCircleSelected: {
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  productInitial: {
    fontSize: 13,
    fontWeight: "700",
  },
  productName: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  checkPlaceholder: {
    width: 28,
  },
  pillWrap: {
    alignItems: "center",
    marginTop: 16,
    marginBottom: 24,
  },
  productPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 8,
  },
  productPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  productPillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  volumeStep: {
    flex: 1,
  },
  volumeCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  volumeInputRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  hugeInput: {
    fontSize: 64,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    minWidth: 80,
    textAlign: "center",
    padding: 0,
  },
  ltrLabel: {
    fontSize: 20,
    color: TEXT_SECONDARY,
    marginLeft: 8,
    fontWeight: "500",
  },
  accentLine: {
    width: 120,
    height: 1,
    backgroundColor: ACCENT,
    marginTop: 12,
  },
  rateHint: {
    marginTop: 12,
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
  },
  lubricantStep: {
    flex: 1,
    paddingHorizontal: 24,
  },
  lubricantFields: {
    gap: 32,
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  underlineInput: {
    fontSize: 20,
    color: TEXT_PRIMARY,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.15)",
  },
  summaryStep: {
    flex: 1,
    paddingHorizontal: 24,
  },
  summaryBlock: {
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  summaryProduct: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
  },
  summaryMeta: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 22,
  },
  summaryTotal: {
    fontSize: 36,
    fontWeight: "700",
    color: ACCENT,
    textAlign: "center",
    marginTop: 4,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 24,
  },
  vehicleLabel: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  vehicleInput: {
    fontSize: 22,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
    paddingVertical: 8,
  },
  vehicleHint: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    textAlign: "center",
    marginTop: 8,
  },
  floatingBtnWrap: {
    position: "absolute",
    bottom: 32,
    left: 24,
    right: 24,
  },
  floatingBtn: {
    height: 56,
    backgroundColor: ACCENT,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  floatingBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  floatingBtnText: {
    color: TEXT_PRIMARY,
    fontSize: 17,
    fontWeight: "700",
  },
  printBtn: {
    height: 60,
    backgroundColor: ACCENT,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  printBtnLoading: {
    backgroundColor: "#2563EB",
  },
  printIcon: {
    fontSize: 20,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  successText: {
    color: "#22c55e",
    fontSize: 24,
    fontWeight: "700",
  },
  ringOuter: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
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
    color: ACCENT,
  },
  duplicateCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  duplicateTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 24,
  },
  duplicateButton: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
  },
  duplicateButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  autoCloseText: {
    fontSize: 12,
    color: "#9ca3af",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loginCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
  },
  loginTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a2e",
    marginBottom: 20,
    textAlign: "center",
  },
  loginInput: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
    color: "#1a1a2e",
  },
  loginButton: {
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  cancelButtonText: {
    color: "#6b7280",
    fontSize: 15,
    fontWeight: "500",
  },
});
