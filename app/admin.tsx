import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  Alert,
  Animated,
  Modal,
  InteractionManager,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "../components/ActionButton";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getPriceHistory, type PriceChange } from "../src/services/PriceHistoryService";
import {
  getCurrentSession,
  getSessionHistory,
  isSessionActive,
  endSlipSession,
  getTodayDateString,
  type SlipSession,
  type CurrentSlipSession,
} from "../src/services/SlipCounterService";
import {
  EzPumpService,
  fetchRates,
  clearRatesCache,
  clearEzPumpSession,
  getRatesFromCache,
  type EzPumpRates,
} from "../src/services/EzPumpService";
import {
  getOriginalInvoices,
  saveInvoice,
  formatSlipDateTime,
  storageKeyToProductType,
  type StoredInvoice,
} from "../src/services/InvoiceHistoryService";
import { usePrinterContext } from "../contexts/PrinterContext";
import { formatCurrency, formatCurrencyValue, generateInvoiceNumber } from "../utils/formatters";
import type { ReceiptData } from "../utils/generateReceipt";
import { Colors, Typography, Radius, Spacing, Shadow, Buttons } from "../constants/theme";
import { EZPUMP_EMAIL, EZPUMP_PASSWORD, EZPUMP_IP, DEFAULT_PORTAL_IP } from "../utils/storage";
import { isValidPortalIp, isValidPortalIpInput } from "../utils/validation";

type Tab = "invoices" | "price" | "slips" | "portal";
type ProductFilter = "all" | "Petrol" | "Diesel" | "Hi-Octane";

const PRODUCT_FILTERS: {
  id: ProductFilter;
  label: string;
  color?: string;
}[] = [
  { id: "all", label: "All" },
  { id: "Petrol", label: "Petrol", color: Colors.product.petrol },
  { id: "Diesel", label: "Diesel", color: Colors.product.diesel },
  { id: "Hi-Octane", label: "Hi-Octane", color: Colors.product.hiOctane },
];

const TABS: { id: Tab; label: string }[] = [
  { id: "invoices", label: "Invoices" },
  { id: "price", label: "Price History" },
  { id: "slips", label: "Slip Counter" },
  { id: "portal", label: "Portal" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const RATES_CACHE_TTL = 10 * 60 * 1000;

const EZPUMP_RATE_PRODUCTS = [
  { name: "Petrol", key: "petrol" as const, color: Colors.product.petrol },
  { name: "Hi-Octane", key: "hiOctane" as const, color: Colors.product.hiOctane },
  { name: "Diesel", key: "diesel" as const, color: Colors.product.diesel },
];

function getProductColor(product: string): string {
  const map: Record<string, string> = {
    PETROL: Colors.product.petrol,
    DIESEL: Colors.product.diesel,
    "HI-OCTANE": Colors.product.hiOctane,
    LUBRICANTS: Colors.product.lubricants,
    "CAR SERVICE": Colors.product.carService,
  };
  return map[product] ?? Colors.text.secondary;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${day} ${month} ${year} ${String(hours12).padStart(2, "0")}:${minutes} ${period}`;
}

function formatDayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${year}`;
}

function formatPriceTableDateTime(iso: string): { dateLine: string; timeLine: string } {
  const d = new Date(iso);
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return {
    dateLine: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
    timeLine: `${String(hours12).padStart(2, "0")}:${minutes} ${period}`,
  };
}

function invoiceMatchesProductFilter(product: string, filter: ProductFilter): boolean {
  if (filter === "all") return true;
  const normalized =
    product === "PETROL" || product === "Petrol"
      ? "Petrol"
      : product === "DIESEL" || product === "Diesel"
        ? "Diesel"
        : product === "HI-OCTANE" || product === "Hi-Octane"
          ? "Hi-Octane"
          : product;
  return normalized === filter;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}***@${domain}`;
}

function storedInvoiceToReceiptData(invoice: StoredInvoice): ReceiptData {
  const printed = new Date(invoice.printedAt);
  const year = printed.getFullYear();
  const month = String(printed.getMonth() + 1).padStart(2, "0");
  const day = String(printed.getDate()).padStart(2, "0");
  const hours = String(printed.getHours()).padStart(2, "0");
  const minutes = String(printed.getMinutes()).padStart(2, "0");

  return {
    stationName: invoice.stationName,
    stationAddress: invoice.address,
    invoiceNumber: generateInvoiceNumber(),
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
    paymentMethod: "Cash",
    productType: storageKeyToProductType(invoice.product),
    fuelRate: String(invoice.rate),
    volume: String(invoice.volume),
    totalAmount: invoice.totalAmount,
    vehicleNumber: invoice.vehicleNo,
    customerName: "",
    includeLogoInPrint: false,
  };
}

function AdminToast({
  visible,
  message,
  type,
  onHide,
}: {
  visible: boolean;
  message: string;
  type: "success" | "error";
  onHide: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      translateY.setValue(20);
      return;
    }

    let cancelled = false;
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;

    const interaction = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;

      opacity.setValue(0);
      translateY.setValue(20);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();

      dismissTimer = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
          ({ finished }) => {
            if (finished && !cancelled) {
              setTimeout(() => onHideRef.current(), 0);
            }
          }
        );
      }, 2500);
    });

    return () => {
      cancelled = true;
      interaction.cancel();
      if (dismissTimer) clearTimeout(dismissTimer);
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [visible, message, opacity, translateY]);

  const dotColor = type === "success" ? Colors.text.success : Colors.text.danger;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.toastWrap,
          {
            bottom: insets.bottom + Spacing.lg,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.toastCard}>
          <View style={[styles.toastDot, { backgroundColor: dotColor }]} />
          <Text style={styles.toastText}>{message}</Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export default function AdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const printer = usePrinterContext();
  const [activeTab, setActiveTab] = useState<Tab>("invoices");
  const [loading, setLoading] = useState(true);
  const [priceHistory, setPriceHistory] = useState<PriceChange[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SlipSession[]>([]);
  const [invoices, setInvoices] = useState<StoredInvoice[]>([]);
  const [currentSession, setCurrentSession] = useState<CurrentSlipSession | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  const [showReprintOverlay, setShowReprintOverlay] = useState(false);
  const [portalIp, setPortalIp] = useState(DEFAULT_PORTAL_IP);
  const [portalEmail, setPortalEmail] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [savedPortalEmail, setSavedPortalEmail] = useState<string | null>(null);
  const [portalConfigured, setPortalConfigured] = useState(false);
  const [portalSaving, setPortalSaving] = useState(false);
  const [portalTesting, setPortalTesting] = useState(false);
  const [ezPumpRates, setEzPumpRates] = useState<EzPumpRates | null>(null);
  const [ratesRefreshing, setRatesRefreshing] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error";
  }>({ visible: false, message: "", type: "success" });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [history, sessions, active, current, invoiceList, email, ip] = await Promise.all([
      getPriceHistory(),
      getSessionHistory(),
      isSessionActive(),
      getCurrentSession(),
      getOriginalInvoices(),
      AsyncStorage.getItem(EZPUMP_EMAIL),
      AsyncStorage.getItem(EZPUMP_IP),
    ]);
    setPriceHistory(history);
    setSessionHistory(sessions);
    setSessionActive(active);
    setCurrentSession(current);
    setInvoices(invoiceList);
    setSavedPortalEmail(email);
    setPortalConfigured(!!email && !!ip);
    if (email) setPortalEmail(email);
    setPortalIp(ip?.trim() || DEFAULT_PORTAL_IP);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    if (activeTab === "price") {
      getPriceHistory().then(setPriceHistory);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "portal") return;

    const cached = getRatesFromCache();
    if (cached) {
      setEzPumpRates(cached);
    }

    const stale =
      !cached || Date.now() - cached.fetchedAt >= RATES_CACHE_TTL;
    if (stale) {
      fetchRates()
        .then(setEzPumpRates)
        .catch((err) => console.warn("fetchRates failed:", err));
    }
  }, [activeTab]);

  const handleRefreshRates = useCallback(async () => {
    setRatesRefreshing(true);
    try {
      clearRatesCache();
      const rates = await fetchRates();
      setEzPumpRates(rates);
    } catch (err) {
      console.warn("fetchRates failed:", err);
    } finally {
      setRatesRefreshing(false);
    }
  }, []);

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (!invoiceMatchesProductFilter(inv.product, productFilter)) return false;
      if (!query) return true;
      return (
        inv.vehicleNo.toLowerCase().includes(query) ||
        inv.dateTime.toLowerCase().includes(query)
      );
    });
  }, [invoices, searchQuery, productFilter]);

  const handleReprint = useCallback(
    async (invoice: StoredInvoice) => {
      setReprintingId(invoice.id);
      try {
        try {
          await printer.ensureConnected();
        } catch {
          // Native printReceipt retries bind — continue even if JS check failed
        }
        const receiptData = storedInvoiceToReceiptData(invoice);
        await printer.printReceipt(receiptData, true);

        await saveInvoice({
          product: invoice.product,
          volume: invoice.volume,
          rate: invoice.rate,
          totalAmount: invoice.totalAmount,
          vehicleNo: invoice.vehicleNo,
          stationName: invoice.stationName,
          address: invoice.address,
          dateTime: formatSlipDateTime(),
          isDuplicate: true,
        });

        const updated = await getOriginalInvoices();
        setInvoices(updated);
        setShowReprintOverlay(true);
      } catch {
        Alert.alert("Print Failed", "Could not print. Check printer connection.");
      } finally {
        setReprintingId(null);
      }
    },
    [printer]
  );

  const handleEndSession = useCallback(async () => {
    Alert.alert("End Session", "Move this session to history?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Session",
        style: "destructive",
        onPress: async () => {
          await endSlipSession();
          await loadData();
        },
      },
    ]);
  }, [loadData]);

  const handleUpdatePortalCredentials = useCallback(async () => {
    const trimmedIp = portalIp.trim();
    if (!isValidPortalIp(trimmedIp)) {
      setToast({
        visible: true,
        message: "Enter a valid portal IP (e.g. 192.168.0.100)",
        type: "error",
      });
      return;
    }

    if (!portalEmail.trim() || !portalPassword.trim()) {
      setToast({
        visible: true,
        message: "Email and password are required",
        type: "error",
      });
      return;
    }

    setPortalSaving(true);
    try {
      await AsyncStorage.setItem(EZPUMP_IP, trimmedIp);
      await AsyncStorage.setItem(EZPUMP_EMAIL, portalEmail.trim());
      await AsyncStorage.setItem(EZPUMP_PASSWORD, portalPassword);
      clearEzPumpSession();
      setSavedPortalEmail(portalEmail.trim());
      setPortalConfigured(true);
      setPortalPassword("");
      setToast({
        visible: true,
        message: "Portal settings updated",
        type: "success",
      });
    } finally {
      setPortalSaving(false);
    }
  }, [portalIp, portalEmail, portalPassword]);

  const handleTestPortalConnection = useCallback(async () => {
    setPortalTesting(true);
    try {
      await EzPumpService.getRecentSales();
      setToast({
        visible: true,
        message: "Connection successful",
        type: "success",
      });
    } catch {
      setToast({
        visible: true,
        message: "Connection failed — check credentials",
        type: "error",
      });
    } finally {
      setPortalTesting(false);
    }
  }, []);

  const weekTotal =
    sessionHistory.reduce((sum, s) => sum + s.totalSlips, 0) +
    (sessionActive && currentSession ? currentSession.totalSlips : 0);
  const todayDate = getTodayDateString();

  const renderInvoiceTab = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.invoiceScrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={Colors.text.tertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by vehicle or date..."
            placeholderTextColor={Colors.text.tertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterPillsScroll}
          contentContainerStyle={styles.filterPillsRow}
        >
          {PRODUCT_FILTERS.map((filter) => {
            const active = productFilter === filter.id;
            const productColor = filter.color;
            const pillActiveStyle =
              active && productColor
                ? {
                    backgroundColor: `${productColor}1F`,
                    borderColor: `${productColor}59`,
                  }
                : null;
            const textActiveStyle =
              active && productColor ? { color: productColor } : null;
            return (
              <Pressable
                key={filter.id}
                onPress={() => setProductFilter(filter.id)}
                style={[
                  styles.filterPill,
                  active && styles.filterPillActive,
                  pillActiveStyle,
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    active && styles.filterPillTextActive,
                    textActiveStyle,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filteredInvoices.length === 0 ? (
          <View style={styles.invoiceEmpty}>
            <Text style={styles.invoiceEmptyIcon}>🧾</Text>
            <Text style={styles.invoiceEmptyTitle}>No original invoices yet</Text>
            <Text style={styles.invoiceEmptySubtitle}>
              Only first-run prints appear here. Duplicates are hidden.
            </Text>
          </View>
        ) : (
          filteredInvoices.map((invoice) => {
            const productColor = getProductColor(invoice.product);
            return (
              <View key={invoice.id} style={styles.receiptCardWrap}>
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
                        ● {invoice.product}
                      </Text>
                    </View>
                    <Text style={styles.invoiceIdText}>#{invoice.id.slice(0, 8)}</Text>
                  </View>

                  <View style={styles.receiptRow2}>
                    <View style={styles.receiptAmountBlock}>
                      <Text style={styles.receiptAmount}>
                        {formatCurrency(invoice.totalAmount)}
                      </Text>
                      <Text style={styles.receiptVolumeRate}>
                        {invoice.volume} LTR · {formatCurrency(invoice.rate)}/ltr
                      </Text>
                    </View>
                    {invoice.vehicleNo.trim() ? (
                      <View style={styles.vehiclePill}>
                        <Text style={styles.vehiclePillText}>{invoice.vehicleNo}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.receiptRow3}>
                    <Text style={styles.receiptDate}>{invoice.dateTime}</Text>
                    <Pressable
                      onPress={() => handleReprint(invoice)}
                      disabled={reprintingId === invoice.id}
                      style={({ pressed }) => [
                        styles.reprintButton,
                        reprintingId === invoice.id && styles.buttonDisabled,
                        pressed && styles.reprintButtonPressed,
                      ]}
                    >
                      {reprintingId === invoice.id ? (
                        <ActivityIndicator size="small" color={Colors.text.accent} />
                      ) : (
                        <Text style={styles.reprintButtonText}>Reprint</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    );
  };

  const renderPriceTab = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {priceHistory.length === 0 ? (
        <Text style={styles.emptyText}>No price changes recorded yet</Text>
      ) : (
        <View style={styles.priceTable}>
          <View style={styles.priceTableHeader}>
            <Text style={[styles.priceTableHeaderCell, styles.priceTableColDate]}>DATE & TIME</Text>
            <Text style={[styles.priceTableHeaderCell, styles.priceTableColProduct]}>PRODUCT</Text>
            <Text style={[styles.priceTableHeaderCell, styles.priceTableColOld]}>OLD</Text>
            <Text style={[styles.priceTableHeaderCell, styles.priceTableColNew]}>NEW</Text>
          </View>
          {priceHistory.map((row, index) => {
            const productColor = getProductColor(row.product);
            const { dateLine, timeLine } = formatPriceTableDateTime(row.changedAt);
            const rowBg = index % 2 === 0 ? Colors.bg.card : Colors.bg.secondary;
            return (
              <View
                key={row.id}
                style={[styles.priceTableRow, { backgroundColor: rowBg }]}
              >
                <View style={styles.priceTableColDate}>
                  <Text style={styles.priceTableDatePrimary}>{dateLine}</Text>
                  <Text style={styles.priceTableDateSecondary}>{timeLine}</Text>
                </View>
                <View style={styles.priceTableColProduct}>
                  <View
                    style={[
                      styles.priceTableProductPill,
                      {
                        backgroundColor: `${productColor}1A`,
                        borderColor: `${productColor}40`,
                      },
                    ]}
                  >
                    <Text style={[styles.priceTableProductPillText, { color: productColor }]}>
                      {row.product}
                    </Text>
                  </View>
                </View>
                <Text style={styles.priceTableOldPrice}>
                  {formatCurrencyValue(row.oldPrice)}
                </Text>
                <Text style={styles.priceTableNewPrice}>
                  {formatCurrencyValue(row.newPrice)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );

  const renderSlipsTab = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {sessionActive && currentSession ? (
        <>
          <View style={styles.slipSessionCard}>
            <Text style={styles.activeSessionLabel}>ACTIVE SESSION</Text>
            <Text style={styles.activeSessionStarted}>
              Started {formatDateTime(currentSession.startedAt)}
            </Text>
            <Text style={styles.activeSessionTotal}>{currentSession.totalSlips}</Text>
            <Text style={styles.activeSessionTotalLabel}>total slips</Text>
          </View>

          <View style={styles.slipDayTableCard}>
            <View style={styles.sessionDayTableHeader}>
              <Text style={[styles.sessionDayHeaderCell, styles.sessionDayColDay]}>DAY</Text>
              <Text style={[styles.sessionDayHeaderCell, styles.sessionDayColDate]}>DATE</Text>
              <Text style={[styles.sessionDayHeaderCell, styles.sessionDayColSlips]}>SLIPS</Text>
            </View>

            {currentSession.days.map((day, index) => {
              const isToday = day.date === todayDate;
              const isLast = index === currentSession.days.length - 1;
              return (
                <View
                  key={`${day.day}-${day.date}`}
                  style={[
                    styles.sessionDayTableRow,
                    !isLast && styles.sessionDayTableRowBorder,
                    isToday && styles.sessionDayTableRowToday,
                  ]}
                >
                  <Text style={[styles.sessionDayCellDay, styles.sessionDayColDay]}>
                    {day.day}
                  </Text>
                  <Text style={[styles.sessionDayCellDate, styles.sessionDayColDate]}>
                    {formatDayDate(day.date)}
                  </Text>
                  <Text style={[styles.sessionDayCellSlips, styles.sessionDayColSlips]}>
                    {day.slipCount}
                  </Text>
                </View>
              );
            })}
          </View>

          <ActionButton
            label="End Session"
            icon="stop-circle-outline"
            variant="secondary"
            onPress={handleEndSession}
            style={styles.endSessionButton}
          />
        </>
      ) : (
        <View style={styles.slipSessionCard}>
          <Text style={styles.emptySessionText}>No active session</Text>
        </View>
      )}

      {sessionHistory.length === 0 ? (
        !sessionActive ? (
          <Text style={styles.emptyText}>No slip sessions recorded yet</Text>
        ) : null
      ) : (
        <>
          <SectionLabel>HISTORY</SectionLabel>
          <View style={styles.slipHistoryTable}>
            <View style={styles.slipHistoryHeader}>
              <Text style={[styles.slipHistoryHeaderCell, styles.slipHistoryColStarted]}>
                STARTED
              </Text>
              <Text style={[styles.slipHistoryHeaderCell, styles.slipHistoryColEnded]}>
                ENDED
              </Text>
              <Text style={[styles.slipHistoryHeaderCell, styles.slipHistoryColSlips]}>
                SLIPS
              </Text>
            </View>
            {sessionHistory.map((session, index) => (
              <View
                key={session.id}
                style={[
                  styles.slipHistoryRow,
                  index % 2 === 1 && styles.slipHistoryRowAlt,
                ]}
              >
                <Text style={[styles.slipHistoryCell, styles.slipHistoryColStarted]}>
                  {formatDateTime(session.startedAt)}
                </Text>
                <Text style={[styles.slipHistoryCell, styles.slipHistoryColEnded]}>
                  {formatDateTime(session.endTime)}
                </Text>
                <Text style={[styles.slipHistoryCellBold, styles.slipHistoryColSlips]}>
                  {session.totalSlips}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.weekTotalText}>Total this week: {weekTotal} slips</Text>
        </>
      )}
    </ScrollView>
  );

  const renderPortalTab = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.portalStatusCard}>
        <View style={styles.portalStatusRow}>
          <View style={styles.portalStatusLeft}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: portalConfigured
                    ? Colors.text.success
                    : Colors.text.danger,
                },
              ]}
            />
            <Text
              style={[
                styles.portalStatusText,
                {
                  color: portalConfigured ? Colors.text.success : Colors.text.danger,
                },
              ]}
            >
              {portalConfigured ? "Connected" : "Not configured"}
            </Text>
          </View>
          {portalConfigured && savedPortalEmail ? (
            <Text style={styles.portalMaskedEmail}>{maskEmail(savedPortalEmail)}</Text>
          ) : null}
        </View>
      </View>

      <SectionLabel>CURRENT RATES FROM EZPUMP</SectionLabel>
      <View style={styles.credentialsGroup}>
        {EZPUMP_RATE_PRODUCTS.map((product, index) => {
          const rate = ezPumpRates?.[product.key] ?? null;
          const isLast = index === EZPUMP_RATE_PRODUCTS.length - 1;
          return (
            <View
              key={product.key}
              style={[styles.credentialsRow, isLast && styles.credentialsRowLast]}
            >
              <View style={styles.rateRowInner}>
                <View style={styles.rateRowLeft}>
                  <View style={[styles.statusDot, { backgroundColor: product.color }]} />
                  <Text style={styles.rateRowLabel}>{product.name}</Text>
                </View>
                {rate !== null ? (
                  <Text style={styles.rateRowValue}>PKR {rate}</Text>
                ) : (
                  <Text style={styles.rateRowUnavailable}>Unavailable</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {ezPumpRates?.fetchedAt ? (
        <Text style={styles.ratesLastFetched}>
          Last fetched:{" "}
          {new Date(ezPumpRates.fetchedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      ) : null}

      <ActionButton
        label="Refresh Rates"
        icon="refresh-outline"
        onPress={handleRefreshRates}
        loading={ratesRefreshing}
        loadingLabel="Refreshing..."
        disabled={ratesRefreshing}
        style={styles.refreshRatesButton}
      />

      <SectionLabel>CREDENTIALS</SectionLabel>
      <View style={styles.credentialsGroup}>
        <View style={styles.credentialsRow}>
          <Text style={styles.credentialsLabel}>Portal IP</Text>
          <TextInput
            style={styles.credentialsInput}
            value={portalIp}
            onChangeText={(value) => {
              if (isValidPortalIpInput(value)) setPortalIp(value);
            }}
            keyboardType="decimal-pad"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={DEFAULT_PORTAL_IP}
            placeholderTextColor={Colors.text.tertiary}
          />
        </View>
        <View style={styles.credentialsRow}>
          <Text style={styles.credentialsLabel}>Portal Email</Text>
          <TextInput
            style={styles.credentialsInput}
            value={portalEmail}
            onChangeText={setPortalEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="admin@ez-pump.com"
            placeholderTextColor={Colors.text.tertiary}
          />
        </View>
        <View style={[styles.credentialsRow, styles.credentialsRowLast]}>
          <Text style={styles.credentialsLabel}>Portal Password</Text>
          <TextInput
            style={styles.credentialsInput}
            value={portalPassword}
            onChangeText={setPortalPassword}
            secureTextEntry
            placeholder="Enter new password"
            placeholderTextColor={Colors.text.tertiary}
          />
        </View>
      </View>

      <ActionButton
        label="Update Credentials"
        icon="save-outline"
        onPress={handleUpdatePortalCredentials}
        loading={portalSaving}
        loadingLabel="Saving..."
        disabled={portalSaving}
        style={styles.portalUpdateButton}
      />

      <ActionButton
        label="Test Connection"
        icon="pulse-outline"
        variant="outline"
        onPress={handleTestPortalConnection}
        loading={portalTesting}
        loadingLabel="Testing..."
        disabled={portalTesting}
        style={styles.portalTestButton}
      />
    </ScrollView>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]} hitSlop={8}>
          <Text style={styles.headerButtonText}>← Home</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]} hitSlop={8}>
          <Text style={styles.headerButtonText}>Logout</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsRow}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {activeTab === "invoices" ? (
        renderInvoiceTab()
      ) : loading && activeTab !== "portal" ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : activeTab === "price" ? (
        renderPriceTab()
      ) : activeTab === "slips" ? (
        renderSlipsTab()
      ) : (
        renderPortalTab()
      )}

      {showReprintOverlay ? (
        <View style={styles.reprintOverlay}>
          <View style={styles.reprintOverlayCard}>
            <Pressable
              onPress={() => setShowReprintOverlay(false)}
              style={({ pressed }) => [
                styles.reprintOverlayClose,
                pressed && styles.reprintOverlayClosePressed,
              ]}
              hitSlop={8}
            >
              <Text style={styles.reprintOverlayCloseText}>✕</Text>
            </Pressable>

            <View style={styles.reprintOverlayIcon}>
              <Ionicons name="checkmark" size={24} color={Colors.text.success} />
            </View>

            <Text style={styles.reprintOverlayTitle}>✓ Printed!</Text>
            <Text style={styles.reprintOverlaySubtitle}>** DUPLICATE COPY **</Text>

            <Pressable
              onPress={() => setShowReprintOverlay(false)}
              style={({ pressed }) => [
                styles.reprintOverlayDoneButton,
                pressed && styles.reprintOverlayDoneButtonPressed,
              ]}
            >
              <Text style={styles.reprintOverlayDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <AdminToast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.bg.primary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
  },
  headerButton: {
    ...Buttons.secondaryCompact,
    minWidth: 72,
  },
  headerButtonPressed: {
    ...Buttons.secondaryPressed,
  },
  headerButtonText: {
    ...Buttons.secondaryCompactText,
  },
  tabsScroll: {
    backgroundColor: Colors.bg.secondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
    maxHeight: 44,
  },
  tabsRow: {
    flexDirection: "row",
    height: 44,
  },
  tab: {
    paddingHorizontal: Spacing.lg,
    height: 44,
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: Colors.accent,
  },
  tabText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.text.tertiary,
    letterSpacing: Typography.wider,
    textTransform: "uppercase",
  },
  tabTextActive: {
    color: Colors.text.accent,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingBottom: Spacing.xxxl,
  },
  invoiceScrollContent: {
    paddingBottom: Spacing.xxxl,
    paddingTop: Spacing.md,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.bg.input,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.full,
    height: 40,
    paddingHorizontal: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 14,
    paddingVertical: 0,
    minHeight: 40,
  },
  filterPillsScroll: {
    marginHorizontal: Spacing.lg,
    marginBottom: 12,
  },
  filterPillsRow: {
    paddingRight: Spacing.lg,
  },
  filterPill: {
    height: 32,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    marginRight: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  filterPillActive: {
    backgroundColor: Colors.accentAlpha,
    borderColor: Colors.border.accent,
  },
  filterPillText: {
    color: Colors.text.secondary,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
  },
  filterPillTextActive: {
    color: Colors.text.accent,
  },
  invoiceEmpty: {
    alignItems: "center",
    paddingTop: Spacing.xxxl * 2,
    paddingHorizontal: Spacing.lg,
  },
  invoiceEmptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  invoiceEmptyTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.semibold,
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  invoiceEmptySubtitle: {
    fontSize: Typography.sm,
    color: Colors.text.tertiary,
    textAlign: "center",
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
  invoiceIdText: {
    color: Colors.text.tertiary,
    fontSize: Typography.xs,
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
    fontSize: Typography.xs,
    flex: 1,
  },
  reprintButton: {
    ...Buttons.reprint,
  },
  reprintButtonPressed: {
    ...Buttons.reprintPressed,
  },
  reprintButtonText: {
    ...Buttons.reprintText,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  emptyText: {
    textAlign: "center",
    color: Colors.text.tertiary,
    fontSize: Typography.base,
    marginTop: Spacing.xxxl,
    paddingHorizontal: Spacing.lg,
  },
  priceTable: {
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
  },
  priceTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.bg.elevated,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  priceTableHeaderCell: {
    fontSize: Typography.xs,
    color: Colors.text.tertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontWeight: Typography.semibold,
  },
  priceTableColDate: {
    flex: 2,
  },
  priceTableColProduct: {
    flex: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  priceTableColOld: {
    flex: 1,
    textAlign: "center",
  },
  priceTableColNew: {
    flex: 1,
    textAlign: "right",
  },
  priceTableRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  priceTableDatePrimary: {
    fontSize: Typography.sm,
    color: Colors.text.primary,
    fontWeight: Typography.bold,
  },
  priceTableDateSecondary: {
    fontSize: Typography.xs,
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  priceTableProductPill: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignSelf: "center",
  },
  priceTableProductPillText: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    textTransform: "uppercase",
  },
  priceTableOldPrice: {
    flex: 1,
    textAlign: "center",
    fontSize: Typography.sm,
    color: Colors.text.tertiary,
    textDecorationLine: "line-through",
  },
  priceTableNewPrice: {
    flex: 1,
    textAlign: "right",
    fontSize: Typography.sm,
    color: Colors.text.primary,
    fontWeight: Typography.bold,
  },
  activeSessionCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  slipSessionCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    overflow: "hidden",
  },
  slipDayTableCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border.default,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    overflow: "hidden",
  },
  slipHistoryTable: {
    marginHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  slipHistoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.bg.elevated,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  slipHistoryHeaderCell: {
    fontSize: Typography.xs,
    color: Colors.text.tertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontWeight: Typography.semibold,
  },
  slipHistoryColStarted: {
    flex: 2,
  },
  slipHistoryColEnded: {
    flex: 2,
  },
  slipHistoryColSlips: {
    flex: 1,
    textAlign: "right",
  },
  slipHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    backgroundColor: Colors.bg.card,
  },
  slipHistoryRowAlt: {
    backgroundColor: Colors.bg.secondary,
  },
  slipHistoryCell: {
    fontSize: Typography.sm,
    color: Colors.text.secondary,
  },
  slipHistoryCellBold: {
    fontSize: Typography.base,
    color: Colors.text.primary,
    fontWeight: Typography.bold,
    textAlign: "right",
  },
  activeSessionLabel: {
    color: Colors.text.accent,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  activeSessionStarted: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
    marginBottom: Spacing.md,
  },
  activeSessionTotal: {
    color: Colors.text.primary,
    fontSize: 48,
    fontWeight: Typography.black,
    letterSpacing: -2,
    lineHeight: 52,
  },
  activeSessionTotalLabel: {
    color: Colors.text.tertiary,
    fontSize: Typography.xs,
    marginBottom: 0,
  },
  sessionDivider: {
    height: 1,
    backgroundColor: Colors.border.subtle,
    marginVertical: 14,
  },
  sessionDayTableHeader: {
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.bg.elevated,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.default,
  },
  sessionDayHeaderCell: {
    fontSize: Typography.xs,
    color: Colors.text.tertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontWeight: Typography.semibold,
  },
  sessionDayColDay: {
    flex: 0.6,
  },
  sessionDayColDate: {
    flex: 2,
  },
  sessionDayColSlips: {
    flex: 1,
    textAlign: "right",
  },
  sessionDayTableRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingHorizontal: Spacing.lg,
    backgroundColor: "transparent",
  },
  sessionDayTableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  sessionDayTableRowToday: {
    backgroundColor: Colors.accentAlpha,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    paddingLeft: 13,
  },
  sessionDayCellDay: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
  sessionDayCellDate: {
    color: Colors.text.primary,
    fontSize: Typography.sm,
  },
  sessionDayCellSlips: {
    color: Colors.text.primary,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    textAlign: "right",
  },
  sessionDayRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    paddingVertical: Spacing.sm,
  },
  sessionDayRowLast: {
    borderBottomWidth: 0,
  },
  sessionDayTitle: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  sessionDayDate: {
    color: Colors.text.tertiary,
    fontSize: Typography.xs,
    marginTop: 2,
  },
  sessionDayCount: {
    color: Colors.text.primary,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
  },
  emptySessionText: {
    color: Colors.text.secondary,
    fontSize: Typography.base,
  },
  sectionLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    color: Colors.text.tertiary,
    letterSpacing: Typography.widest,
    textTransform: "uppercase",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  historySessionCard: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  historySessionTitle: {
    color: Colors.text.primary,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    marginBottom: Spacing.xs,
  },
  historySessionTotal: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
    marginBottom: Spacing.md,
  },
  weekTotalText: {
    color: Colors.text.tertiary,
    fontSize: Typography.sm,
    textAlign: "center",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  portalStatusCard: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    margin: Spacing.lg,
  },
  portalStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  portalStatusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  portalStatusText: {
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  portalMaskedEmail: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
  },
  rateRowInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  rateRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rateRowLabel: {
    color: Colors.text.primary,
    fontSize: Typography.base,
  },
  rateRowValue: {
    color: Colors.text.primary,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
  },
  rateRowUnavailable: {
    color: Colors.text.tertiary,
    fontSize: Typography.base,
  },
  ratesLastFetched: {
    color: Colors.text.tertiary,
    fontSize: Typography.xs,
    textAlign: "right",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  credentialsGroup: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    marginHorizontal: Spacing.lg,
    overflow: "hidden",
  },
  credentialsRow: {
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
  },
  credentialsRowLast: {
    borderBottomWidth: 0,
  },
  credentialsLabel: {
    color: Colors.text.primary,
    fontSize: Typography.base,
    marginBottom: Spacing.sm,
  },
  credentialsInput: {
    backgroundColor: Colors.bg.input,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.sm,
    height: 48,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    color: Colors.text.primary,
    fontSize: Typography.base,
  },
  loadingButtonRow: {
    ...Buttons.loadingRow,
  },
  refreshRatesButton: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    marginHorizontal: Spacing.lg,
    height: 48,
  },
  portalUpdateButton: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    height: 52,
  },
  portalTestButton: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    height: 48,
  },
  endSessionButton: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    height: 46,
  },
  reprintOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xxl,
    zIndex: 100,
  },
  reprintOverlayCard: {
    width: "100%",
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.xl,
    paddingVertical: 28,
    paddingHorizontal: Spacing.xxl,
    alignItems: "center",
    ...Shadow.elevated,
  },
  reprintOverlayClose: {
    position: "absolute",
    top: Spacing.lg,
    right: Spacing.lg,
    ...Buttons.icon,
    zIndex: 1,
  },
  reprintOverlayClosePressed: {
    ...Buttons.iconPressed,
  },
  reprintOverlayCloseText: {
    color: Colors.text.secondary,
    fontSize: Typography.md,
    lineHeight: 20,
  },
  reprintOverlayIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(34,197,94,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  reprintOverlayTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.text.primary,
    marginTop: Spacing.md,
    textAlign: "center",
  },
  reprintOverlaySubtitle: {
    fontSize: Typography.xs,
    color: Colors.text.warning,
    textAlign: "center",
    marginTop: Spacing.sm,
    fontWeight: Typography.semibold,
    letterSpacing: Typography.wider,
  },
  reprintOverlayDoneButton: {
    ...Buttons.accentOutline,
    height: 50,
    marginTop: 18,
  },
  reprintOverlayDoneButtonPressed: {
    ...Buttons.accentOutlinePressed,
  },
  reprintOverlayDoneText: {
    ...Buttons.accentOutlineText,
  },
  toastWrap: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    alignItems: "center",
  },
  toastCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  toastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  toastText: {
    color: Colors.text.primary,
    fontSize: Typography.sm,
  },
});
