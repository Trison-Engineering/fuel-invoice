import React, { useState, useCallback, useLayoutEffect, useEffect, useRef, useMemo } from "react";
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
  RefreshControl,
  Keyboard,
} from "react-native";
import { useRouter, useNavigation, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFormState } from "../hooks/useFormState";
import { usePrinterContext } from "../contexts/PrinterContext";
// import { PrinterStatus } from "../components/PrinterStatus";
import { Toast } from "../components/Toast";
import { ActionButton } from "../components/ActionButton";
// import { ReceiptPreviewScreen } from "../src/screens/ReceiptPreviewScreen";
import { Colors, Typography, Radius, Spacing, Shadow, Buttons } from "../constants/theme";
import { ReceiptData } from "../utils/generateReceipt";
import {
  getCurrentSession,
  isSessionActive,
  incrementSlipCount,
  getTodaySlipCount,
} from "../src/services/SlipCounterService";
import {
  saveInvoice,
  formatSlipDateTime,
  productTypeToStorageKey,
} from "../src/services/InvoiceHistoryService";
import {
  EzPumpService,
  fetchRates,
  getEffectiveRate,
  getOfficialRateForProduct,
  type EzPumpSale,
} from "../src/services/EzPumpService";
import { generateMockSales } from "../src/services/MockDataService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LIVE_FEED_FILTER_ENABLED, LIVE_FEED_FILTER_PRODUCT, MOCK_DATA_ENABLED } from "../utils/storage";

const TOTAL_STEPS = 3;
const STEP_ANIM_MS = 180;
const DUPLICATE_COUNTDOWN_SECONDS = 10;
const ADMIN_EMAIL = "admin@admin.com";
const ADMIN_PASSWORD = "admin@123";

const FUEL_OPTIONS = [
  { id: "Petrol", label: "PETROL", color: Colors.product.petrol },
  { id: "Diesel", label: "DIESEL", color: Colors.product.diesel },
  { id: "Hi-Octane", label: "HI-OCTANE", color: Colors.product.hiOctane },
] as const;

type FuelId = (typeof FUEL_OPTIONS)[number]["id"];

const AVAILABLE_PRODUCTS = ["Petrol", "Diesel", "Hi-Octane"] as const;

const PRODUCTS = [
  { name: "Petrol", label: "PETROL", color: Colors.product.petrol },
  { name: "Diesel", label: "DIESEL", color: Colors.product.diesel },
  { name: "Hi-Octane", label: "HI-OCTANE", color: Colors.product.hiOctane },
] as const;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getProductColor(product: string): string {
  const map: Record<string, string> = {
    Petrol: Colors.product.petrol,
    Diesel: Colors.product.diesel,
    HiOctane: Colors.product.hiOctane,
    "Hi-Octane": Colors.product.hiOctane,
    Lubricants: Colors.product.lubricants,
    "Car Service": Colors.product.carService,
  };
  return map[product] ?? Colors.text.secondary;
}

function getProductRgb(product: string): string {
  const p = product?.toLowerCase() || "";
  if (p.includes("petrol")) return "34,197,94";
  if (p.includes("diesel")) return "59,130,246";
  if (
    p.includes("hioctane") ||
    p.includes("hi-octane") ||
    p.includes("octane")
  ) {
    return "168,85,247";
  }
  if (p.includes("lubricant")) return "245,158,11";
  return "136,146,164";
}

function formatCardDateTime(dateStr: string): string {
  const commaMatch = dateStr.match(/^(\d{1,2}\s+\w{3}\s+\d{4}),\s*(.+)$/);
  if (commaMatch) {
    const datePart = commaMatch[1].trim();
    const dayMonth = datePart.split(" ").slice(0, 2).join(" ");
    return `${dayMonth} · ${commaMatch[2].trim()}`;
  }
  const parsed = new Date(dateStr);
  if (!Number.isNaN(parsed.getTime())) {
    const hours = parsed.getHours();
    const minutes = String(parsed.getMinutes()).padStart(2, "0");
    const period = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12;
    return `${parsed.getDate()} ${MONTHS_SHORT[parsed.getMonth()]} · ${String(hours12).padStart(2, "0")}:${minutes} ${period}`;
  }
  return dateStr;
}

function mapEzPumpProduct(product: string): string {
  if (product === "HiOctane") return "Hi-Octane";
  return product;
}

function normalizeProductForLiveFeedFilter(product: string): string {
  return mapEzPumpProduct(product).toLowerCase().replace(/-/g, "");
}

function productToBadgeKey(product: string): string {
  const map: Record<string, string> = {
    Petrol: "PETROL",
    Diesel: "DIESEL",
    HiOctane: "HI-OCTANE",
    "Hi-Octane": "HI-OCTANE",
    Lubricants: "LUBRICANTS",
    "Car Service": "CAR SERVICE",
  };
  return map[product] ?? product.toUpperCase();
}

function ezPumpSaleToReceiptData(
  sale: EzPumpSale,
  stationName: string,
  stationAddress: string,
  stationExtras: {
    stationPhone?: string;
    logoDataUrl?: string | null;
    logo2DataUrl?: string | null;
    includeLogoInPrint?: boolean;
    useTwoLogos?: boolean;
  }
): ReceiptData {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  const amount = parseFloat(sale.amount) || 0;
  const qty = parseFloat(sale.qty) || 0;
  const effectiveRate = getEffectiveRate(sale);
  const rate =
    effectiveRate ??
    (qty > 0 ? parseFloat((amount / qty).toFixed(2)) : null);

  return {
    stationName,
    stationAddress,
    invoiceNumber: sale.id,
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
    paymentMethod: sale.payment || "Cash",
    productType: mapEzPumpProduct(sale.product),
    fuelRate: rate !== null ? String(rate) : "0",
    volume: qty > 0 ? String(qty) : sale.qty || "0",
    totalAmount: amount,
    vehicleNumber: sale.vehicle,
    customerName: sale.customer,
    stationPhone: stationExtras.stationPhone,
    logoDataUrl: stationExtras.logoDataUrl,
    logo2DataUrl: stationExtras.logo2DataUrl,
    includeLogoInPrint: stationExtras.includeLogoInPrint,
    useTwoLogos: stationExtras.useTwoLogos,
  };
}

function CardSkeleton() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.8,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.skeletonCard, { opacity }]}>
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonBar, { width: 70, height: 22, borderRadius: Radius.full }]} />
        <View style={[styles.skeletonBar, { width: 80, height: 22, borderRadius: Radius.full }]} />
      </View>
      <View style={[styles.skeletonRow, { marginTop: Spacing.md }]}>
        <View style={[styles.skeletonBar, { width: 130, height: 16 }]} />
        <View style={[styles.skeletonBar, { width: 60, height: 16 }]} />
      </View>
      <View style={[styles.skeletonRow, { marginTop: Spacing.md }]}>
        <View style={[styles.skeletonBar, { width: 100, height: 16 }]} />
        <View style={[styles.skeletonBar, { width: 60, height: 28, borderRadius: Radius.sm }]} />
      </View>
    </Animated.View>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyStateIconWrap}>{icon}</View>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateSubtitle}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [styles.emptyStateAction, pressed && styles.emptyStateActionPressed]}
        >
          <Text style={styles.emptyStateActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function StepProgressBar({
  currentStep,
  screenWidth,
}: {
  currentStep: number;
  screenWidth: number;
}) {
  const progress = useRef(new Animated.Value((currentStep / TOTAL_STEPS) * screenWidth)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: (currentStep / TOTAL_STEPS) * screenWidth,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [currentStep, screenWidth, progress]);

  return (
    <View style={[styles.progressTrack, { width: screenWidth }]}>
      <Animated.View style={[styles.progressFill, { width: progress }]} />
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const printer = usePrinterContext();
  const form = useFormState();
  const { width: screenWidth } = useWindowDimensions();

  const [currentStep, setCurrentStep] = useState(0);
  const [cardReprintingId, setCardReprintingId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<FuelId | null>(null);
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
  const [sessionTotal, setSessionTotal] = useState(0);
  const [ezPumpPollEnabled, setEzPumpPollEnabled] = useState(true);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminLoginIntent, setAdminLoginIntent] = useState<"admin" | "manualPrint">("admin");
  const [adminSigningIn, setAdminSigningIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [ezPumpSales, setEzPumpSales] = useState<EzPumpSale[]>([]);
  const [ezPumpLoading, setEzPumpLoading] = useState(false);
  const [ezPumpError, setEzPumpError] = useState<string | null>(null);
  const [liveFeedFilterEnabled, setLiveFeedFilterEnabled] = useState(false);
  const [liveFeedFilterProduct, setLiveFeedFilterProduct] = useState<string | null>(null);
  const [mockDataEnabled, setMockDataEnabled] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [vehicleFocused, setVehicleFocused] = useState(false);
  const [adminEmailFocused, setAdminEmailFocused] = useState(false);
  const [adminPasswordFocused, setAdminPasswordFocused] = useState(false);
  const [officialRate, setOfficialRate] = useState<number | null>(null);
  const [selectedSale, setSelectedSale] = useState<EzPumpSale | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetVehicle, setSheetVehicle] = useState("");
  const [sheetPrinting, setSheetPrinting] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const stepOpacity = useRef(new Animated.Value(1)).current;
  const step1ContinueAnim = useRef(new Animated.Value(0)).current;
  const duplicateSlideAnim = useRef(new Animated.Value(0)).current;
  const closingDuplicate = useRef(false);
  const sheetTranslateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const hideToast = useCallback(() => {
    setToast((t) => ({ ...t, visible: false }));
  }, []);

  const loadLiveFeedFilter = useCallback(async () => {
    const enabled = await AsyncStorage.getItem(LIVE_FEED_FILTER_ENABLED);
    const product = await AsyncStorage.getItem(LIVE_FEED_FILTER_PRODUCT);
    const mock = await AsyncStorage.getItem(MOCK_DATA_ENABLED);
    setLiveFeedFilterEnabled(enabled === "true");
    setLiveFeedFilterProduct(product || null);
    setMockDataEnabled(mock === "true");
  }, []);

  useEffect(() => {
    loadLiveFeedFilter();
  }, [loadLiveFeedFilter]);

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
      const session = await getCurrentSession();
      const active = await isSessionActive();
      setSessionActive(active);
      if (session) {
        setSessionCount(getTodaySlipCount(session));
        setSessionTotal(session.totalSlips);
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
      headerTitle: () => (
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerBrand}>Petro Slip</Text>
          <Text style={styles.headerProBadge}>PRO</Text>
        </View>
      ),
      headerStyle: {
        backgroundColor: Colors.bg.primary,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border.subtle,
        height: 56,
      },
      headerShadowVisible: false,
      headerTintColor: Colors.text.secondary,
      headerRight: () => (
        <View style={styles.headerRight}>
          {sessionActive && sessionCount > 0 ? (
            <View style={styles.counterBadge}>
              <Text style={styles.counterBadgeText}>● {sessionCount}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => {
              setAdminLoginIntent("admin");
              setShowAdminLogin(true);
            }}
            style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconPressed]}
          >
            <Ionicons name="person-outline" size={22} color={Colors.text.secondary} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconPressed]}
          >
            <Ionicons name="settings-outline" size={22} color={Colors.text.secondary} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, router, sessionActive, sessionCount]);

  const animateToStep = useCallback(
    (nextStep: number, direction: "forward" | "back") => {
      const exitTo = direction === "forward" ? -30 : 30;
      const enterFrom = direction === "forward" ? 30 : -30;

      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: exitTo,
          duration: STEP_ANIM_MS,
          useNativeDriver: true,
        }),
        Animated.timing(stepOpacity, {
          toValue: 0,
          duration: STEP_ANIM_MS,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentStep(nextStep);
        slideAnim.setValue(enterFrom);
        stepOpacity.setValue(0);
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: STEP_ANIM_MS,
            useNativeDriver: true,
          }),
          Animated.timing(stepOpacity, {
            toValue: 1,
            duration: STEP_ANIM_MS,
            useNativeDriver: true,
          }),
        ]).start();
      });
    },
    [slideAnim, stepOpacity]
  );

  const goForward = useCallback(
    (nextStep: number) => animateToStep(nextStep, "forward"),
    [animateToStep]
  );

  const goBack = useCallback(
    (prevStep: number) => animateToStep(prevStep, "back"),
    [animateToStep]
  );

  const resetSteps = useCallback(() => {
    setCurrentStep(0);
    setSelectedProduct(null);
    setOfficialRate(null);
    form.updateFuelRate("");
    form.updateVolume("");
    form.updateVehicleNumber("");
    setPrintSuccess(false);
    setDuplicateCountdown(DUPLICATE_COUNTDOWN_SECONDS);
    setLastPrintData(null);
  }, [form]);

  useEffect(() => {
    if (currentStep !== 2 || !selectedProduct) return;

    let cancelled = false;

    (async () => {
      try {
        const rates = await fetchRates();
        if (cancelled) return;
        const rate = getOfficialRateForProduct(selectedProduct, rates);
        if (rate !== null) {
          setOfficialRate(rate);
          form.updateFuelRate(String(rate));
        } else {
          setOfficialRate(null);
          form.updateFuelRate(form.station.getFuelPrice(selectedProduct));
        }
      } catch (err) {
        console.warn("fetchRates failed:", err);
        if (cancelled) return;
        setOfficialRate(null);
        form.updateFuelRate(form.station.getFuelPrice(selectedProduct));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentStep, selectedProduct, form]);

  useEffect(() => {
    if (currentStep === 1 && selectedProduct) {
      Animated.spring(step1ContinueAnim, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      step1ContinueAnim.setValue(0);
    }
  }, [currentStep, selectedProduct, step1ContinueAnim]);

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

  const handleAdminLogin = useCallback(() => {
    setAdminSigningIn(true);
    if (adminEmail === ADMIN_EMAIL && adminPassword === ADMIN_PASSWORD) {
      const intent = adminLoginIntent;
      setShowAdminLogin(false);
      setAdminEmail("");
      setAdminPassword("");
      if (intent === "manualPrint") {
        setCurrentStep(1);
      } else {
        router.push("/admin");
      }
    } else {
      Alert.alert("Invalid credentials");
    }
    setAdminSigningIn(false);
  }, [adminEmail, adminPassword, adminLoginIntent, router, setCurrentStep]);

  const saveInvoiceFromReceipt = useCallback(
    async (receiptData: ReceiptData, isDuplicate: boolean) => {
      await saveInvoice({
        product: productTypeToStorageKey(receiptData.productType),
        volume: parseFloat(receiptData.volume),
        rate: parseFloat(receiptData.fuelRate),
        totalAmount: receiptData.totalAmount,
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

  const loadMockSales = useCallback(() => {
    setEzPumpError(null);
    setEzPumpLoading(false);
    setEzPumpSales(generateMockSales());
    setLastRefreshed(new Date());
  }, []);

  const fetchEzPumpSales = useCallback(async () => {
    try {
      setEzPumpLoading(true);
      setEzPumpError(null);
      const sales = await EzPumpService.getRecentSales();
      setEzPumpSales(sales);
      setLastRefreshed(new Date());
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "CREDENTIALS_NOT_SET") {
        setEzPumpError("CREDENTIALS_NOT_SET");
        setEzPumpPollEnabled(false);
      } else if (err instanceof Error && err.message === "PORTAL_IP_NOT_SET") {
        setEzPumpError("PORTAL_IP_NOT_SET");
        setEzPumpPollEnabled(false);
      } else if (err instanceof Error && err.message === "NETWORK_UNAVAILABLE") {
        setEzPumpError("Not connected to station network");
      } else {
        setEzPumpError("Unable to load live data");
      }
    } finally {
      setEzPumpLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (currentStep === 0) {
        setEzPumpPollEnabled(true);
        loadLiveFeedFilter();
      }
    }, [currentStep, loadLiveFeedFilter])
  );

  const displayedSales = useMemo(() => {
    if (!liveFeedFilterEnabled || !liveFeedFilterProduct) {
      return ezPumpSales;
    }
    const filterKey = liveFeedFilterProduct.toLowerCase().replace(/-/g, "");
    return ezPumpSales.filter(
      (sale) => normalizeProductForLiveFeedFilter(sale.product) === filterKey
    );
  }, [ezPumpSales, liveFeedFilterEnabled, liveFeedFilterProduct]);

  useEffect(() => {
    if (currentStep !== 0) return;

    if (mockDataEnabled) {
      loadMockSales();
      const interval = setInterval(loadMockSales, 10000);
      return () => clearInterval(interval);
    }

    if (!ezPumpPollEnabled) return;

    fetchEzPumpSales();
    const interval = setInterval(fetchEzPumpSales, 10000);
    return () => clearInterval(interval);
  }, [currentStep, ezPumpPollEnabled, fetchEzPumpSales, mockDataEnabled, loadMockSales]);

  const handleDismissDuplicate = useCallback(() => {
    if (closingDuplicate.current) return;
    setDuplicateCountdown(0);
  }, []);

  function openSheet(sale: EzPumpSale) {
    setSelectedSale(sale);
    setSheetVehicle("");
    setSheetPrinting(false);
    setSheetVisible(true);

    Animated.parallel([
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function closeSheet() {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(sheetTranslateY, {
        toValue: 600,
        duration: 280,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSheetVisible(false);
      setSelectedSale(null);
      setSheetVehicle("");
      sheetTranslateY.setValue(600);
    });
  }

  async function handleSheetPrint() {
    if (!selectedSale || sheetPrinting) return;

    Keyboard.dismiss();
    setSheetPrinting(true);

    try {
      const saleToPrint: EzPumpSale = {
        ...selectedSale,
        vehicle: sheetVehicle.trim() || selectedSale.vehicle,
      };

      closeSheet();
      await handleCardReprint(saleToPrint);
    } catch (error) {
      setSheetPrinting(false);
      console.error("Sheet print error:", error);
      Alert.alert("Print Failed", "Could not print receipt. Please try again.");
    } finally {
      setSheetPrinting(false);
    }
  }

  const handleCardReprint = useCallback(
    async (sale: EzPumpSale) => {
      setCardReprintingId(sale.id);
      try {
        try {
          await printer.ensureConnected();
        } catch {
          // Native printReceipt retries bind — continue even if JS check failed
        }

        const receiptData = ezPumpSaleToReceiptData(
          sale,
          form.station.stationName,
          form.station.stationAddress,
          {
            stationPhone: form.station.stationPhone,
            logoDataUrl: form.station.logoDataUrl,
            logo2DataUrl: form.station.logo2DataUrl,
            includeLogoInPrint: form.station.includeLogoInPrint,
            useTwoLogos: form.station.useTwoLogos,
          }
        );

        await printer.printReceipt(receiptData, false);
        setPrintSuccess(true);

        const slipCounts = await incrementSlipCount();
        setSessionActive(true);
        setSessionCount(slipCounts.todayCount);
        setSessionTotal(slipCounts.totalSlips);

        await saveInvoiceFromReceipt(receiptData, false);

        setLastPrintData(receiptData);
        setDuplicateCountdown(DUPLICATE_COUNTDOWN_SECONDS);
        setShowDuplicate(true);
        setTimeout(() => setPrintSuccess(false), 800);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Print failed";
        Alert.alert("Print failed", msg);
      } finally {
        setCardReprintingId(null);
      }
    },
    [form.station, printer, saveInvoiceFromReceipt]
  );

  const handlePrint = useCallback(
    async () => {
      if (!form.station.isProfileComplete()) {
        Alert.alert("Station setup required", "Please complete your station profile in Settings first.");
        router.push("/settings?setup=1");
        return;
      }

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

        const slipCounts = await incrementSlipCount();
        setSessionActive(true);
        setSessionCount(slipCounts.todayCount);
        setSessionTotal(slipCounts.totalSlips);

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

  const handleSelectFuel = useCallback(
    (fuelId: FuelId) => {
      setSelectedProduct(fuelId);
      form.setProductType(fuelId);
      form.updateFuelRate(form.station.getFuelPrice(fuelId));
    },
    [form]
  );

  if (!form.station.isHydrated) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (!form.station.isProfileComplete()) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  const selectedFuelColor = selectedProduct ? getProductColor(selectedProduct) : Colors.accent;
  const stepRate =
    officialRate !== null
      ? String(officialRate)
      : selectedProduct
        ? form.station.getFuelPrice(selectedProduct)
        : form.fuelRate || "0";
  const stepVolume = form.volume || "0";
  const stepTotal = form.totalAmount ?? 0;
  const step2CanContinue = (() => {
    const volume = parseFloat(form.volume);
    return form.volume.trim().length > 0 && !isNaN(volume) && volume > 0;
  })();

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <>
            <Text style={styles.stepHeading}>What are you dispensing?</Text>
            <Text style={styles.stepSubheading}>Select a product to continue</Text>
            <View style={styles.fuelListCard}>
              {PRODUCTS.map((product, index) => {
                const isSelected = selectedProduct === product.name;
                const isLast = index === PRODUCTS.length - 1;
                return (
                  <Pressable
                    key={product.name}
                    onPress={() => handleSelectFuel(product.name)}
                    style={[
                      !isLast && styles.fuelListRowBorder,
                      isSelected && { backgroundColor: `${product.color}18` },
                    ]}
                  >
                    <View style={styles.fuelListRowInner}>
                      <View
                        style={[styles.fuelListDot, { backgroundColor: product.color }]}
                      />
                      <Text
                        style={[
                          styles.fuelListLabel,
                          { color: isSelected ? product.color : Colors.text.primary },
                        ]}
                      >
                        {product.label}
                      </Text>
                      <View
                        style={[
                          styles.fuelListRadio,
                          isSelected
                            ? { backgroundColor: product.color, borderWidth: 0 }
                            : styles.fuelListRadioEmpty,
                        ]}
                      >
                        {isSelected ? <View style={styles.fuelListRadioInner} /> : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        );

      case 2:
        return (
          <>
            {selectedProduct ? (
              <View style={styles.stepProductPillWrap}>
                <View
                  style={[
                    styles.productPill,
                    {
                      backgroundColor: `${selectedFuelColor}1A`,
                      borderColor: `${selectedFuelColor}40`,
                    },
                  ]}
                >
                  <Text style={[styles.productPillText, { color: selectedFuelColor }]}>
                    ● {productToBadgeKey(selectedProduct)}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={styles.volumeBlock}>
              <View style={styles.volumeInputRow}>
                <TextInput
                  style={styles.volumeNumberInput}
                  value={form.volume}
                  onChangeText={form.updateVolume}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={Colors.text.tertiary}
                  autoFocus
                />
                <Text style={styles.volumeSuffix}>LTR</Text>
              </View>
              <View style={styles.volumeUnderline} />
              <Text style={styles.volumeRateText}>PKR {stepRate} / ltr</Text>
            </View>
          </>
        );

      case 3:
        return (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryProduct}>
                {selectedProduct ?? form.productType}
              </Text>
              <Text style={styles.summaryMeta}>
                {stepVolume} LTR · PKR {stepRate}/ltr
              </Text>
              <Text style={styles.summaryTotal}>PKR {stepTotal.toFixed(2)}</Text>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryDetailRow}>
                <Text style={styles.summaryDetailLabel}>Volume</Text>
                <Text style={styles.summaryDetailValue}>{stepVolume} LTR</Text>
              </View>
              <View style={styles.summaryDetailRow}>
                <Text style={styles.summaryDetailLabel}>Rate</Text>
                <Text style={styles.summaryDetailValue}>PKR {stepRate}/ltr</Text>
              </View>
              <View style={styles.summaryDetailRow}>
                <Text style={styles.summaryDetailLabel}>Total</Text>
                <Text style={styles.summaryDetailValue}>PKR {stepTotal.toFixed(2)}</Text>
              </View>
            </View>

            <Text style={styles.vehicleLabel}>VEHICLE NUMBER</Text>
            <TextInput
              style={[
                styles.vehicleInput,
                {
                  borderColor: vehicleFocused ? Colors.border.strong : Colors.border.default,
                },
              ]}
              value={form.vehicleNumber}
              onChangeText={form.updateVehicleNumber}
              placeholder="e.g. ABC-428"
              placeholderTextColor={Colors.text.tertiary}
              autoCapitalize="characters"
              autoFocus
              onFocus={() => setVehicleFocused(true)}
              onBlur={() => setVehicleFocused(false)}
            />
            <Text style={styles.vehicleHint}>Optional — tap Print to skip</Text>
          </>
        );

      default:
        return null;
    }
  };

  const renderDashboard = () => (
    <ScrollView
      style={styles.dashboardScroll}
      contentContainerStyle={[
        styles.dashboardContent,
        { paddingBottom: Math.max(insets.bottom, 32) },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={ezPumpLoading}
          onRefresh={mockDataEnabled ? loadMockSales : fetchEzPumpSales}
          tintColor={Colors.accent}
        />
      }
    >
      <Pressable
        onPress={() => {
          setAdminLoginIntent("manualPrint");
          setShowAdminLogin(true);
        }}
        style={({ pressed }) => [
          styles.printNewReceiptButton,
          pressed && styles.printNewReceiptButtonPressed,
        ]}
      >
        <View style={styles.printNewReceiptContent}>
          <View style={styles.printNewReceiptLeft}>
            <Ionicons name="print-outline" size={20} color="#FFFFFF" />
            <Text style={styles.printNewReceiptText} numberOfLines={1}>
              Print New Receipt
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color="rgba(255,255,255,0.5)"
            style={styles.printNewReceiptChevron}
          />
        </View>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>LIVE RECEIPTS</Text>
        <View style={styles.sectionHeaderRight}>
          {ezPumpLoading ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : null}
          {lastRefreshed && !ezPumpLoading ? (
            <Text style={styles.sectionSubtitle}>
              Updated{" "}
              {lastRefreshed.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          ) : null}
        </View>
      </View>

      {ezPumpError && ezPumpSales.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="cloud-offline-outline" size={48} color={Colors.text.tertiary} />}
          title={
            ezPumpError === "CREDENTIALS_NOT_SET" || ezPumpError === "PORTAL_IP_NOT_SET"
              ? "Portal not configured"
              : ezPumpError === "Not connected to station network"
                ? "Not connected to station network"
                : "Unable to load live data"
          }
          subtitle={
            ezPumpError === "CREDENTIALS_NOT_SET" || ezPumpError === "PORTAL_IP_NOT_SET"
              ? "Set portal IP and credentials in Admin → Portal"
              : ezPumpError === "Not connected to station network"
                ? "Connect to TrisonPumpController WiFi"
                : "Check your connection and try again"
          }
          actionLabel={
            ezPumpError !== "CREDENTIALS_NOT_SET" && ezPumpError !== "PORTAL_IP_NOT_SET"
              ? "Retry"
              : undefined
          }
          onAction={
            ezPumpError !== "CREDENTIALS_NOT_SET" && ezPumpError !== "PORTAL_IP_NOT_SET"
              ? fetchEzPumpSales
              : undefined
          }
        />
      ) : null}

      {!ezPumpError && !ezPumpLoading && ezPumpSales.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="receipt-outline" size={48} color={Colors.text.tertiary} />}
          title="No live receipts yet"
          subtitle="Pump sales from EzPump will appear here"
        />
      ) : null}

      {!ezPumpError &&
      !ezPumpLoading &&
      liveFeedFilterEnabled &&
      liveFeedFilterProduct &&
      ezPumpSales.length > 0 &&
      displayedSales.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="filter-outline" size={32} color={Colors.text.tertiary} />}
          title={`No ${liveFeedFilterProduct} sales yet`}
          subtitle={`Showing ${liveFeedFilterProduct} only · change in Settings`}
        />
      ) : null}

      {ezPumpLoading && ezPumpSales.length === 0 ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </>
      ) : null}

      {displayedSales.map((sale) => {
        const displayProduct = mapEzPumpProduct(sale.product);
        const badgeKey = productToBadgeKey(displayProduct);
        const productColor = getProductColor(displayProduct);
        const effectiveRate = getEffectiveRate(sale);
        const rateLabel =
          effectiveRate !== null
            ? `PKR ${effectiveRate.toFixed(2)}/ltr`
            : "Rate N/A";

        return (
          <Pressable key={sale.id} style={styles.receiptCardWrap} onPress={() => openSheet(sale)}>
            <View style={[styles.receiptCardAccent, { backgroundColor: productColor }]} />
            <View style={styles.receiptCard}>
              <View style={styles.receiptRow1}>
                <View
                  style={[
                    styles.productPill,
                    {
                      backgroundColor: `${productColor}1A`,
                      borderColor: `${productColor}40`,
                    },
                  ]}
                >
                  <Text style={[styles.productPillText, { color: productColor }]}>
                    ● {badgeKey}
                  </Text>
                </View>
                <Text style={styles.receiptMeta}>
                  N°{sale.nozzleId || "—"}
                  <Text style={styles.receiptMetaDot}> · </Text>#{sale.id}
                </Text>
              </View>

              <View style={styles.receiptRow2}>
                <View style={styles.receiptAmountBlock}>
                  <Text style={styles.receiptAmount}>PKR {sale.amount}</Text>
                  <Text style={styles.receiptVolumeRate}>
                    {sale.qty} LTR · {rateLabel}
                  </Text>
                </View>
                {sale.vehicle.trim() ? (
                  <View style={styles.vehiclePill}>
                    <Text style={styles.vehiclePillText}>{sale.vehicle}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.receiptRow3}>
                <Text style={styles.receiptDate}>{formatCardDateTime(sale.date)}</Text>
                <Pressable
                  onPress={() => openSheet(sale)}
                  disabled={cardReprintingId === sale.id}
                  style={({ pressed }) => [
                    styles.cardPrintButton,
                    cardReprintingId === sale.id && styles.printButtonDisabled,
                    pressed && styles.cardPrintButtonPressed,
                  ]}
                >
                  {cardReprintingId === sale.id ? (
                    <ActivityIndicator size="small" color={Colors.text.accent} />
                  ) : (
                    <>
                      <Ionicons name="print-outline" size={13} color={Colors.text.accent} />
                      <Text style={styles.cardPrintButtonText}>Print</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={styles.root}>
      {currentStep === 0 ? (
        renderDashboard()
      ) : (
        <View style={styles.stepScreen}>
          <StepProgressBar currentStep={currentStep} screenWidth={screenWidth} />
          <KeyboardAvoidingView
            style={styles.stepKeyboard}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          >
            <ScrollView
              contentContainerStyle={[
                styles.stepScrollContent,
                { paddingBottom: Math.max(insets.bottom, Spacing.xl) },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Animated.View
                style={[
                  styles.stepContent,
                  {
                    transform: [{ translateX: slideAnim }],
                    opacity: stepOpacity,
                  },
                ]}
              >
                <Pressable
                  onPress={() => goBack(currentStep - 1)}
                  style={({ pressed }) => [
                    styles.backButton,
                    pressed && styles.backButtonPressed,
                  ]}
                  hitSlop={8}
                >
                  <Text style={styles.backButtonText}>← Back</Text>
                </Pressable>

                <Text style={styles.stepIndicator}>
                  STEP {currentStep} OF {TOTAL_STEPS}
                </Text>

                {renderStepContent()}
              </Animated.View>
            </ScrollView>

            <View
              style={[
                styles.stepFooter,
                { paddingBottom: Math.max(insets.bottom, Spacing.lg) },
              ]}
            >
              {currentStep === 1 ? (
                <ActionButton
                  label="Continue"
                  icon="arrow-forward"
                  onPress={() => goForward(2)}
                  disabled={!selectedProduct}
                />
              ) : null}

              {currentStep === 2 ? (
                <ActionButton
                  label="Continue"
                  icon="arrow-forward"
                  onPress={() => goForward(3)}
                  disabled={!step2CanContinue}
                />
              ) : null}

              {currentStep === 3 ? (
                <ActionButton
                  label="Print Receipt"
                  icon="print-outline"
                  onPress={handlePrint}
                  loading={isPrinting || printer.isReconnecting}
                  loadingLabel="Printing..."
                  disabled={isPrinting || printer.isReconnecting}
                  style={{ height: 60 }}
                />
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {isPrinting ? (
        <View style={styles.fullOverlay}>
          <ActivityIndicator size="large" color={Colors.text.primary} />
          <Text style={styles.overlayText}>Printing...</Text>
        </View>
      ) : null}

      {printSuccess ? (
        <View style={styles.fullOverlay}>
          <Text style={styles.successText}>✓ Printed!</Text>
        </View>
      ) : null}

      {showDuplicate ? (
        <View style={styles.duplicateOverlay}>
          <Animated.View
            style={[
              styles.duplicateCard,
              { transform: [{ translateX: duplicateSlideAnim }] },
            ]}
          >
            <Pressable
              onPress={handleDismissDuplicate}
              style={({ pressed }) => [
                styles.iconBtn,
                {
                  position: "absolute",
                  top: 14,
                  right: 14,
                  zIndex: 10,
                },
                pressed && styles.iconBtnPressed,
              ]}
            >
              <Text
                style={{
                  fontSize: Typography.md,
                  color: Colors.text.secondary,
                  fontWeight: Typography.semibold,
                }}
              >
                ✕
              </Text>
            </Pressable>

            <View style={styles.duplicateSuccessIcon}>
              <Ionicons name="checkmark" size={24} color={Colors.text.success} />
            </View>

            <Text style={styles.duplicateSuccessTitle}>✓ Printed!</Text>

            <Text style={styles.duplicateCountdownText}>
              Print duplicate in {duplicateCountdown}s
            </Text>

            <ActionButton
              label="Print Duplicate?"
              icon="copy-outline"
              variant="outline"
              onPress={handleDuplicatePrint}
              style={{ marginTop: Spacing.lg, marginBottom: Spacing.sm }}
            />

            <ActionButton
              label="Skip"
              variant="secondary"
              onPress={handleDismissDuplicate}
            />
          </Animated.View>
        </View>
      ) : null}

      <Modal visible={showAdminLogin} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.loginCard}>
            <Ionicons name="lock-closed-outline" size={40} color={Colors.text.tertiary} style={styles.loginLockIcon} />
            <Text style={styles.loginTitle}>
              {adminLoginIntent === "manualPrint" ? "Manual Print" : "Admin Access"}
            </Text>
            <Text style={styles.loginSubtitle}>Enter credentials to continue</Text>
            <TextInput
              style={[
                styles.loginInput,
                {
                  borderColor: adminEmailFocused ? Colors.border.strong : Colors.border.default,
                },
              ]}
              placeholder="Email"
              placeholderTextColor={Colors.text.tertiary}
              value={adminEmail}
              onChangeText={setAdminEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              onFocus={() => setAdminEmailFocused(true)}
              onBlur={() => setAdminEmailFocused(false)}
            />
            <TextInput
              style={[
                styles.loginInput,
                {
                  borderColor: adminPasswordFocused ? Colors.border.strong : Colors.border.default,
                },
              ]}
              placeholder="Password"
              placeholderTextColor={Colors.text.tertiary}
              value={adminPassword}
              onChangeText={setAdminPassword}
              secureTextEntry
              onFocus={() => setAdminPasswordFocused(true)}
              onBlur={() => setAdminPasswordFocused(false)}
            />
            <ActionButton
              label="Login"
              icon="log-in-outline"
              onPress={handleAdminLogin}
              loading={adminSigningIn}
              loadingLabel="Signing in..."
              disabled={adminSigningIn}
              style={styles.loginPrimaryBtn}
            />
            <ActionButton
              label="Cancel"
              variant="secondary"
              onPress={() => {
                setShowAdminLogin(false);
                setAdminEmail("");
                setAdminPassword("");
                setAdminLoginIntent("admin");
              }}
              style={styles.loginSecondaryBtn}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

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

      {sheetVisible && selectedSale ? (
        <>
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "rgba(0,0,0,0.75)",
              opacity: backdropOpacity,
              zIndex: 100,
            }}
          >
            <Pressable style={{ flex: 1 }} onPress={closeSheet} />
          </Animated.View>

          <Animated.View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              transform: [{ translateY: sheetTranslateY }],
              zIndex: 101,
              backgroundColor: Colors.bg.elevated,
              borderTopLeftRadius: Radius.xl,
              borderTopRightRadius: Radius.xl,
              borderTopWidth: 1,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderColor: Colors.border.default,
              paddingBottom: Spacing.xxxl,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -8 },
              shadowOpacity: 0.4,
              shadowRadius: 24,
              elevation: 20,
            }}
          >
            <View
              style={{
                alignItems: "center",
                paddingTop: Spacing.md,
                paddingBottom: Spacing.sm,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: Radius.xs,
                  backgroundColor: Colors.border.strong,
                }}
              />
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              keyboardVerticalOffset={0}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: Spacing.xl,
                    paddingBottom: Spacing.lg,
                    borderBottomWidth: 1,
                    borderBottomColor: Colors.border.subtle,
                  }}
                >
                  <Text
                    style={{
                      fontSize: Typography.lg,
                      fontWeight: Typography.bold,
                      color: Colors.text.primary,
                      letterSpacing: Typography.tight,
                    }}
                  >
                    Print Receipt
                  </Text>

                  <Pressable
                    onPress={closeSheet}
                    style={({ pressed }) => ({
                      width: 32,
                      height: 32,
                      borderRadius: Radius.full,
                      backgroundColor: pressed ? Colors.bg.hover : Colors.bg.hover,
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                  >
                    <Text
                      style={{
                        fontSize: Typography.md,
                        color: Colors.text.secondary,
                        fontWeight: Typography.semibold,
                      }}
                    >
                      ✕
                    </Text>
                  </Pressable>
                </View>

                <View
                  style={{
                    marginHorizontal: Spacing.lg,
                    marginTop: Spacing.lg,
                    backgroundColor: Colors.bg.card,
                    borderRadius: Radius.md,
                    borderWidth: 1,
                    borderColor: Colors.border.default,
                    padding: 14,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: Spacing.md,
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: `rgba(${getProductRgb(selectedSale.product)}, 0.1)`,
                        borderWidth: 1,
                        borderColor: `rgba(${getProductRgb(selectedSale.product)}, 0.25)`,
                        borderRadius: Radius.full,
                        paddingHorizontal: Spacing.md,
                        paddingVertical: 3,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: Typography.xs,
                          fontWeight: Typography.bold,
                          color: getProductColor(mapEzPumpProduct(selectedSale.product)),
                          letterSpacing: Typography.wider,
                          textTransform: "uppercase",
                        }}
                      >
                        ● {productToBadgeKey(mapEzPumpProduct(selectedSale.product))}
                      </Text>
                    </View>

                    <Text
                      style={{
                        fontSize: Typography.sm,
                        color: Colors.text.tertiary,
                      }}
                    >
                      N°{selectedSale.nozzleId || "—"} · #{selectedSale.id}
                    </Text>
                  </View>

                  <Text
                    style={{
                      fontSize: Typography.xxl,
                      fontWeight: Typography.bold,
                      color: Colors.text.primary,
                      letterSpacing: Typography.tight,
                      marginBottom: Spacing.xs,
                    }}
                  >
                    PKR {parseFloat(selectedSale.amount).toLocaleString()}
                  </Text>

                  <Text
                    style={{
                      fontSize: Typography.sm,
                      color: Colors.text.secondary,
                      marginBottom: Spacing.md,
                    }}
                  >
                    {selectedSale.qty} LTR
                    {getEffectiveRate(selectedSale)
                      ? ` · PKR ${getEffectiveRate(selectedSale)}/ltr`
                      : ""}
                  </Text>

                  <View
                    style={{
                      height: 1,
                      backgroundColor: Colors.border.subtle,
                      marginBottom: Spacing.md,
                    }}
                  />

                  {[
                    {
                      label: "Volume",
                      value: `${selectedSale.qty} LTR`,
                    },
                    {
                      label: "Rate",
                      value: getEffectiveRate(selectedSale)
                        ? `PKR ${getEffectiveRate(selectedSale)}/ltr`
                        : "N/A",
                    },
                    {
                      label: "Total",
                      value: `PKR ${parseFloat(selectedSale.amount).toLocaleString()}`,
                    },
                    {
                      label: "Nozzle",
                      value: `N°${selectedSale.nozzleId || "—"}`,
                    },
                    {
                      label: "Date",
                      value: selectedSale.date,
                    },
                  ].map((row, i) => (
                    <View
                      key={i}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        height: 32,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: Typography.sm,
                          color: Colors.text.tertiary,
                        }}
                      >
                        {row.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: Typography.sm,
                          fontWeight: Typography.semibold,
                          color: Colors.text.primary,
                        }}
                      >
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </View>

                <View
                  style={{
                    marginHorizontal: Spacing.lg,
                    marginTop: Spacing.lg,
                  }}
                >
                  <Text
                    style={{
                      fontSize: Typography.xs,
                      fontWeight: Typography.semibold,
                      color: Colors.text.tertiary,
                      letterSpacing: Typography.widest,
                      textTransform: "uppercase",
                      marginBottom: Spacing.sm,
                    }}
                  >
                    VEHICLE NUMBER
                  </Text>

                  <TextInput
                    value={sheetVehicle}
                    onChangeText={(text) => setSheetVehicle(text.toUpperCase())}
                    placeholder="e.g. ABC-428"
                    placeholderTextColor={Colors.text.tertiary}
                    autoCapitalize="characters"
                    returnKeyType="done"
                    onSubmitEditing={handleSheetPrint}
                    style={{
                      backgroundColor: Colors.bg.input,
                      borderWidth: 1,
                      borderColor: Colors.border.default,
                      borderRadius: Radius.sm,
                      height: 52,
                      paddingHorizontal: Spacing.lg,
                      fontSize: Typography.lg,
                      fontWeight: Typography.bold,
                      color: Colors.text.primary,
                      letterSpacing: 1,
                    }}
                  />

                  <Text
                    style={{
                      fontSize: Typography.xs,
                      color: Colors.text.tertiary,
                      textAlign: "center",
                      marginTop: Spacing.sm,
                    }}
                  >
                    Optional — tap Print to skip
                  </Text>
                </View>

                <Pressable
                  onPress={handleSheetPrint}
                  disabled={sheetPrinting}
                  style={({ pressed }) => ({
                    marginHorizontal: Spacing.lg,
                    marginTop: Spacing.xl,
                    height: 60,
                    backgroundColor:
                      sheetPrinting || pressed ? Colors.accentDark : Colors.accent,
                    borderRadius: Radius.lg,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: Spacing.sm,
                    ...Shadow.glow,
                    opacity: sheetPrinting ? 0.85 : 1,
                    transform: [{ scale: pressed && !sheetPrinting ? 0.97 : 1 }],
                  })}
                >
                  {sheetPrinting ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text
                        style={{
                          fontSize: Typography.md,
                          fontWeight: Typography.bold,
                          color: "#FFFFFF",
                        }}
                      >
                        Printing...
                      </Text>
                    </>
                  ) : (
                    <Text
                      style={{
                        fontSize: Typography.md,
                        fontWeight: Typography.bold,
                        color: "#FFFFFF",
                      }}
                    >
                      🖨 Print Receipt
                    </Text>
                  )}
                </Pressable>
              </ScrollView>
            </KeyboardAvoidingView>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.bg.primary,
  },
  primaryBtn: {
    ...Buttons.primary,
  },
  primaryBtnPressed: {
    ...Buttons.primaryPressed,
  },
  primaryBtnDisabled: {
    ...Buttons.primaryDisabled,
  },
  primaryBtnText: {
    ...Buttons.primaryText,
  },
  primaryBtnTextDisabled: {
    ...Buttons.primaryTextDisabled,
  },
  secondaryBtn: {
    ...Buttons.secondary,
  },
  secondaryBtnPressed: {
    ...Buttons.secondaryPressed,
  },
  secondaryBtnText: {
    ...Buttons.secondaryText,
  },
  accentOutlineBtn: {
    ...Buttons.accentOutline,
  },
  accentOutlineBtnPressed: {
    ...Buttons.accentOutlinePressed,
  },
  accentOutlineBtnText: {
    ...Buttons.accentOutlineText,
  },
  iconBtn: {
    ...Buttons.icon,
  },
  iconBtnPressed: {
    ...Buttons.iconPressed,
  },
  loadingRow: {
    ...Buttons.loadingRow,
  },
  destructiveBtn: {
    ...Buttons.destructive,
  },
  destructiveBtnPressed: {
    ...Buttons.destructivePressed,
  },
  destructiveBtnText: {
    ...Buttons.destructiveText,
  },
  absoluteBottomBtn: {
    position: "absolute",
    bottom: 32,
    left: 20,
    right: 20,
    alignSelf: "stretch",
  },
  stepFooter: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border.subtle,
    backgroundColor: Colors.bg.primary,
  },
  fuelListCard: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
    overflow: "hidden",
  },
  fuelListRowInner: {
    flexDirection: "row",
    alignItems: "center",
    height: 64,
    paddingHorizontal: Spacing.xl,
  },
  fuelListRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  fuelListDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: Spacing.md,
    flexShrink: 0,
  },
  fuelListLabel: {
    flex: 1,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
    letterSpacing: Typography.wide,
  },
  fuelListRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  fuelListRadioEmpty: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: Colors.border.default,
  },
  fuelListRadioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.text.primary,
  },
  headerTitleWrap: {
    justifyContent: "center",
  },
  headerBrand: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
  },
  headerProBadge: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: Colors.text.accent,
    letterSpacing: Typography.widest,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginRight: Spacing.sm,
  },
  counterBadge: {
    backgroundColor: Colors.accentAlpha,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    borderRadius: Radius.full,
    paddingVertical: Spacing.xs,
    paddingHorizontal: 10,
  },
  counterBadgeText: {
    color: Colors.text.accent,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
  headerIconBtn: {
    ...Buttons.icon,
  },
  headerIconPressed: {
    ...Buttons.iconPressed,
  },
  dashboardScroll: {
    flex: 1,
  },
  dashboardContent: {
    paddingBottom: Spacing.xxxl,
  },
  printNewReceiptButton: {
    ...Buttons.primary,
    height: 60,
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.lg,
    alignSelf: "stretch",
  },
  printNewReceiptButtonPressed: {
    ...Buttons.primaryPressed,
  },
  printNewReceiptContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    height: "100%",
  },
  printNewReceiptLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginRight: Spacing.sm,
  },
  printNewReceiptChevron: {
    flexShrink: 0,
  },
  printNewReceiptText: {
    ...Buttons.primaryText,
    flexShrink: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.xl,
    marginBottom: 10,
    marginHorizontal: Spacing.lg,
  },
  sectionHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.text.tertiary,
    letterSpacing: Typography.widest,
  },
  sectionSubtitle: {
    fontSize: Typography.xs,
    color: Colors.text.tertiary,
  },
  errorState: {
    alignItems: "center",
    marginHorizontal: Spacing.xxxl,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.lg,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyStateIconWrap: {
    marginBottom: Spacing.lg,
    alignItems: "center",
  },
  emptyStateTitle: {
    color: Colors.text.secondary,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
    textAlign: "center",
  },
  emptyStateSubtitle: {
    color: Colors.text.tertiary,
    fontSize: Typography.sm,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  emptyStateAction: {
    marginTop: Spacing.xl,
    ...Buttons.accentOutlineGhost,
    paddingHorizontal: Spacing.xxl,
  },
  emptyStateActionPressed: {
    ...Buttons.secondaryPressed,
  },
  emptyStateActionText: {
    ...Buttons.accentOutlineGhostText,
  },
  loadingButtonRow: {
    ...Buttons.loadingRow,
  },
  buttonLoading: {
    ...Buttons.primaryLoading,
  },
  skeletonCard: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.md,
    marginHorizontal: Spacing.lg,
    marginBottom: 10,
    padding: 14,
    paddingLeft: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  skeletonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  skeletonBar: {
    backgroundColor: Colors.bg.hover,
    borderRadius: Radius.xs,
  },
  receiptCardWrap: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: 10,
    borderRadius: Radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  receiptCardAccent: {
    width: 3,
  },
  receiptCard: {
    flex: 1,
    backgroundColor: Colors.bg.card,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
  },
  receiptRow1: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  productPill: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  productPillText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: Typography.wider,
    textTransform: "uppercase",
  },
  receiptMeta: {
    color: Colors.text.tertiary,
    fontSize: Typography.sm,
  },
  receiptMetaDot: {
    color: Colors.text.tertiary,
  },
  receiptRow2: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: Spacing.md,
  },
  receiptAmountBlock: {
    flex: 1,
  },
  receiptAmount: {
    color: Colors.text.primary,
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    letterSpacing: Typography.tight,
  },
  receiptVolumeRate: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
    marginTop: Spacing.xs,
  },
  vehiclePill: {
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.full,
    paddingVertical: Spacing.xs,
    paddingHorizontal: 10,
    marginLeft: Spacing.sm,
  },
  vehiclePillText: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
  },
  receiptRow3: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  receiptDate: {
    color: Colors.text.tertiary,
    fontSize: 12,
  },
  cardPrintButton: {
    ...Buttons.reprint,
    flexDirection: "row",
    gap: Spacing.xs,
  },
  cardPrintButtonPressed: {
    ...Buttons.reprintPressed,
  },
  cardPrintButtonText: {
    ...Buttons.reprintText,
  },
  printButtonDisabled: {
    opacity: 0.7,
  },
  stepScreen: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  stepKeyboard: {
    flex: 1,
    position: "relative",
  },
  stepScrollContent: {
    flexGrow: 1,
  },
  stepContent: {
    paddingHorizontal: Spacing.xl,
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  progressFill: {
    height: 3,
    backgroundColor: Colors.accent,
  },
  backButton: {
    ...Buttons.secondary,
    width: undefined,
    alignSelf: "flex-start",
    height: 44,
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  backButtonPressed: {
    ...Buttons.secondaryPressed,
  },
  backButtonText: {
    ...Buttons.secondaryText,
  },
  stepIndicator: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.text.tertiary,
    letterSpacing: Typography.widest,
    textTransform: "uppercase",
    textAlign: "center",
    marginTop: Spacing.xl,
  },
  stepHeading: {
    fontSize: Typography.xxxl,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
    letterSpacing: Typography.tight,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  stepSubheading: {
    fontSize: Typography.sm,
    color: Colors.text.tertiary,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  stepProductPillWrap: {
    alignItems: "center",
    marginTop: Spacing.xxl,
  },
  volumeBlock: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.xxxl,
  },
  volumeInputRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  volumeNumberInput: {
    fontSize: 64,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
    textAlign: "center",
    minWidth: 120,
    padding: 0,
  },
  volumeSuffix: {
    fontSize: Typography.lg,
    color: Colors.text.tertiary,
    marginLeft: Spacing.sm,
  },
  volumeUnderline: {
    width: 100,
    height: 1.5,
    backgroundColor: Colors.accent,
    marginTop: Spacing.sm,
  },
  volumeRateText: {
    fontSize: Typography.sm,
    color: Colors.text.tertiary,
    marginTop: Spacing.md,
    textAlign: "center",
  },
  summaryCard: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
  },
  summaryProduct: {
    color: Colors.text.primary,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
  },
  summaryMeta: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
    marginTop: Spacing.xs,
  },
  summaryTotal: {
    color: Colors.accent,
    fontSize: Typography.xxl,
    fontWeight: Typography.bold,
    marginTop: Spacing.sm,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.border.subtle,
    marginVertical: Spacing.md,
  },
  summaryDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 36,
  },
  summaryDetailLabel: {
    color: Colors.text.tertiary,
    fontSize: 12,
  },
  summaryDetailValue: {
    color: Colors.text.primary,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  vehicleLabel: {
    fontSize: Typography.xs,
    color: Colors.text.tertiary,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
  vehicleInput: {
    backgroundColor: Colors.bg.input,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.sm,
    height: 52,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    color: Colors.text.primary,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    textTransform: "uppercase",
  },
  vehicleHint: {
    fontSize: Typography.xs,
    color: Colors.text.tertiary,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  overlayText: {
    color: Colors.text.primary,
    fontSize: Typography.md,
    fontWeight: Typography.medium,
  },
  successText: {
    color: Colors.text.success,
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
  },
  duplicateOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xxl,
    zIndex: 999,
  },
  duplicateCard: {
    position: "relative",
    alignSelf: "stretch",
    width: "100%",
    maxWidth: 360,
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border.default,
    paddingTop: 44,
    paddingBottom: Spacing.xxl,
    paddingHorizontal: Spacing.xxl,
    alignItems: "stretch",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  duplicateSuccessIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(34,197,94,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    alignSelf: "center",
  },
  duplicateSuccessTitle: {
    fontSize: 22,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
    marginBottom: 6,
    textAlign: "center",
    alignSelf: "center",
  },
  duplicateCountdownText: {
    fontSize: Typography.sm,
    color: Colors.text.secondary,
    textAlign: "center",
    marginBottom: 20,
    alignSelf: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xxl,
  },
  loginCard: {
    backgroundColor: Colors.bg.elevated,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xxl,
    width: "100%",
    maxWidth: 360,
    marginHorizontal: Spacing.xxl,
    borderWidth: 1,
    borderColor: Colors.border.default,
    alignItems: "stretch",
    ...Shadow.elevated,
  },
  loginLockIcon: {
    marginBottom: Spacing.xl,
    alignSelf: "center",
  },
  loginTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
    textAlign: "center",
    alignSelf: "center",
  },
  loginSubtitle: {
    fontSize: Typography.sm,
    color: Colors.text.tertiary,
    textAlign: "center",
    marginTop: 6,
    marginBottom: Spacing.xl,
    alignSelf: "center",
  },
  loginInput: {
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    height: 48,
    fontSize: Typography.base,
    marginBottom: Spacing.md,
    color: Colors.text.primary,
    backgroundColor: Colors.bg.input,
    width: "100%",
  },
  loginPrimaryBtn: {
    marginTop: Spacing.xl,
    height: 52,
  },
  loginSecondaryBtn: {
    marginTop: Spacing.sm,
    height: 46,
  },
});
