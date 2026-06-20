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
import { useRouter } from "expo-router";
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
import { EzPumpService } from "../src/services/EzPumpService";
import {
  getOriginalInvoices,
  saveInvoice,
  formatSlipDateTime,
  storageKeyToProductType,
  type StoredInvoice,
} from "../src/services/InvoiceHistoryService";
import { usePrinterContext } from "../contexts/PrinterContext";
import { formatCurrency, generateInvoiceNumber } from "../utils/formatters";
import type { ReceiptData } from "../utils/generateReceipt";
import { Colors, Typography, Radius, Spacing, Shadow } from "../constants/theme";
import { EZPUMP_EMAIL, EZPUMP_PASSWORD } from "../utils/storage";

type Tab = "invoices" | "price" | "slips" | "portal";
type DateFilter = "all" | "today" | "week";

const TABS: { id: Tab; label: string }[] = [
  { id: "invoices", label: "Invoices" },
  { id: "price", label: "Price History" },
  { id: "slips", label: "Slip Counter" },
  { id: "portal", label: "Portal" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}***@${domain}`;
}

function isPrintedToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function isPrintedThisWeek(iso: string): boolean {
  const d = new Date(iso);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return d > cutoff;
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
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  const [showReprintOverlay, setShowReprintOverlay] = useState(false);
  const [portalEmail, setPortalEmail] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [savedPortalEmail, setSavedPortalEmail] = useState<string | null>(null);
  const [portalConfigured, setPortalConfigured] = useState(false);
  const [portalSaving, setPortalSaving] = useState(false);
  const [portalTesting, setPortalTesting] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error";
  }>({ visible: false, message: "", type: "success" });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [history, sessions, active, current, invoiceList, email] = await Promise.all([
      getPriceHistory(),
      getSessionHistory(),
      isSessionActive(),
      getCurrentSession(),
      getOriginalInvoices(),
      AsyncStorage.getItem(EZPUMP_EMAIL),
    ]);
    setPriceHistory(history);
    setSessionHistory(sessions);
    setSessionActive(active);
    setCurrentSession(current);
    setInvoices(invoiceList);
    setSavedPortalEmail(email);
    setPortalConfigured(!!email);
    if (email) setPortalEmail(email);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (dateFilter === "today" && !isPrintedToday(inv.printedAt)) return false;
      if (dateFilter === "week" && !isPrintedThisWeek(inv.printedAt)) return false;
      if (!query) return true;
      return (
        inv.vehicleNo.toLowerCase().includes(query) ||
        inv.dateTime.toLowerCase().includes(query)
      );
    });
  }, [invoices, searchQuery, dateFilter]);

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
      await AsyncStorage.setItem(EZPUMP_EMAIL, portalEmail.trim());
      await AsyncStorage.setItem(EZPUMP_PASSWORD, portalPassword);
      setSavedPortalEmail(portalEmail.trim());
      setPortalConfigured(true);
      setPortalPassword("");
      setToast({
        visible: true,
        message: "Credentials updated",
        type: "success",
      });
    } finally {
      setPortalSaving(false);
    }
  }, [portalEmail, portalPassword]);

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
          contentContainerStyle={styles.filterPillsRow}
        >
          {(["all", "today", "week"] as const).map((filter) => {
            const active = dateFilter === filter;
            return (
              <Pressable
                key={filter}
                onPress={() => setDateFilter(filter)}
                style={[styles.filterPill, active && styles.filterPillActive]}
              >
                <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                  {filter === "all" ? "All" : filter === "today" ? "Today" : "This Week"}
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
        <View style={styles.timeline}>
          <View style={styles.timelineLine} />
          {priceHistory.map((row) => {
            const productColor = getProductColor(row.product);
            return (
              <View key={row.id} style={styles.timelineEntry}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineDate}>{formatDateTime(row.changedAt)}</Text>
                  <View
                    style={[
                      styles.productPill,
                      {
                        backgroundColor: `${productColor}1A`,
                        borderColor: `${productColor}40`,
                        alignSelf: "flex-start",
                        marginTop: Spacing.sm,
                      },
                    ]}
                  >
                    <Text style={[styles.productPillText, { color: productColor }]}>
                      ● {row.product}
                    </Text>
                  </View>
                  <Text style={styles.priceChangeRow}>
                    <Text style={styles.oldPrice}>{formatCurrency(row.oldPrice)}</Text>
                    <Text style={styles.priceArrow}> → </Text>
                    <Text style={styles.newPrice}>{formatCurrency(row.newPrice)}</Text>
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );

  const renderSlipsTab = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.activeSessionCard}>
        {sessionActive && currentSession ? (
          <>
            <Text style={styles.activeSessionLabel}>ACTIVE SESSION</Text>
            <Text style={styles.activeSessionStarted}>
              Started {formatDateTime(currentSession.startedAt)}
            </Text>
            <Text style={styles.activeSessionTotal}>{currentSession.totalSlips}</Text>
            <Text style={styles.activeSessionTotalLabel}>total slips</Text>

            <View style={styles.sessionDivider} />

            {currentSession.days.map((day, index) => {
              const isToday = day.date === todayDate;
              const isLast = index === currentSession.days.length - 1;
              return (
                <View
                  key={`${day.day}-${day.date}`}
                  style={[
                    styles.sessionDayRow,
                    isToday && styles.sessionDayRowToday,
                    isLast && styles.sessionDayRowLast,
                  ]}
                >
                  <View>
                    <Text style={styles.sessionDayTitle}>Day {day.day}</Text>
                    <Text style={styles.sessionDayDate}>{formatDayDate(day.date)}</Text>
                  </View>
                  <Text style={styles.sessionDayCount}>{day.slipCount} slips</Text>
                </View>
              );
            })}

            <Pressable
              onPress={handleEndSession}
              style={({ pressed }) => [
                styles.endSessionButton,
                pressed && styles.endSessionButtonPressed,
              ]}
            >
              <Text style={styles.endSessionButtonText}>End Session</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.emptySessionText}>No active session</Text>
        )}
      </View>

      {sessionHistory.length === 0 ? (
        !sessionActive ? (
          <Text style={styles.emptyText}>No slip sessions recorded yet</Text>
        ) : null
      ) : (
        <>
          <SectionLabel>HISTORY</SectionLabel>
          {sessionHistory.map((session) => (
            <View key={session.id} style={styles.historySessionCard}>
              <Text style={styles.historySessionTitle}>
                Session — {formatDateTime(session.startedAt)}
              </Text>
              <Text style={styles.historySessionTotal}>
                {session.totalSlips} total slips
              </Text>
              {session.days.map((day, index) => (
                <View
                  key={`${session.id}-${day.day}`}
                  style={[
                    styles.sessionDayRow,
                    index === session.days.length - 1 && styles.sessionDayRowLast,
                  ]}
                >
                  <View>
                    <Text style={styles.sessionDayTitle}>Day {day.day}</Text>
                    <Text style={styles.sessionDayDate}>{formatDayDate(day.date)}</Text>
                  </View>
                  <Text style={styles.sessionDayCount}>{day.slipCount} slips</Text>
                </View>
              ))}
            </View>
          ))}
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

      <SectionLabel>CREDENTIALS</SectionLabel>
      <View style={styles.credentialsGroup}>
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

      <Pressable
        onPress={handleUpdatePortalCredentials}
        disabled={portalSaving}
        style={({ pressed }) => [
          styles.portalPrimaryButton,
          portalSaving && styles.buttonDisabled,
          pressed && !portalSaving && styles.portalPrimaryButtonPressed,
        ]}
      >
        {portalSaving ? (
          <View style={styles.loadingButtonRow}>
            <ActivityIndicator size="small" color={Colors.text.primary} />
            <Text style={styles.portalPrimaryButtonText}>Updating...</Text>
          </View>
        ) : (
          <Text style={styles.portalPrimaryButtonText}>Update Credentials</Text>
        )}
      </Pressable>

      <Pressable
        onPress={handleTestPortalConnection}
        disabled={portalTesting}
        style={({ pressed }) => [
          styles.portalSecondaryButton,
          portalTesting && styles.buttonDisabled,
          pressed && styles.portalSecondaryButtonPressed,
        ]}
      >
        {portalTesting ? (
          <View style={styles.loadingButtonRow}>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={styles.portalSecondaryButtonText}>Testing...</Text>
          </View>
        ) : (
          <Text style={styles.portalSecondaryButtonText}>Test Connection</Text>
        )}
      </Pressable>
    </ScrollView>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/")} style={styles.headerButton} hitSlop={8}>
          <Text style={styles.headerButtonText}>← Home</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <Pressable onPress={() => router.replace("/")} style={styles.headerButton} hitSlop={8}>
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
              style={styles.reprintOverlayClose}
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
    padding: Spacing.sm,
    minWidth: 72,
    minHeight: 44,
    justifyContent: "center",
  },
  headerButtonText: {
    color: Colors.text.accent,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
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
  filterPillsRow: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterPill: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.full,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginRight: Spacing.sm,
  },
  filterPillActive: {
    backgroundColor: Colors.accentAlpha,
    borderColor: Colors.border.accent,
  },
  filterPillText: {
    color: Colors.text.secondary,
    fontSize: 12,
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
    backgroundColor: "rgba(59,130,246,0.1)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.3)",
    borderRadius: Radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: "center",
  },
  reprintButtonPressed: {
    backgroundColor: "rgba(59,130,246,0.2)",
    transform: [{ scale: 0.95 }],
  },
  reprintButtonText: {
    color: Colors.text.accent,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
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
  timeline: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    paddingLeft: 20,
    position: "relative",
  },
  timelineLine: {
    position: "absolute",
    left: 3,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: Colors.border.default,
  },
  timelineEntry: {
    flexDirection: "row",
    marginBottom: Spacing.xl,
    paddingLeft: Spacing.lg,
  },
  timelineDot: {
    position: "absolute",
    left: -1,
    top: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  timelineContent: {
    flex: 1,
  },
  timelineDate: {
    color: Colors.text.tertiary,
    fontSize: Typography.xs,
  },
  priceChangeRow: {
    marginTop: Spacing.sm,
  },
  oldPrice: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
    textDecorationLine: "line-through",
  },
  priceArrow: {
    color: Colors.text.tertiary,
    fontSize: Typography.sm,
  },
  newPrice: {
    color: Colors.text.primary,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
  activeSessionCard: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    margin: Spacing.lg,
  },
  activeSessionLabel: {
    color: Colors.text.accent,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: Typography.widest,
    textTransform: "uppercase",
  },
  activeSessionStarted: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
    marginTop: Spacing.xs,
  },
  activeSessionTotal: {
    color: Colors.text.primary,
    fontSize: Typography.xxxl,
    fontWeight: Typography.bold,
    letterSpacing: Typography.tight,
    marginTop: Spacing.md,
  },
  activeSessionTotalLabel: {
    color: Colors.text.tertiary,
    fontSize: Typography.xs,
    letterSpacing: Typography.wide,
    textTransform: "lowercase",
  },
  sessionDivider: {
    height: 1,
    backgroundColor: Colors.border.subtle,
    marginVertical: 14,
  },
  sessionDayRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.subtle,
    paddingVertical: Spacing.sm,
  },
  sessionDayRowToday: {
    backgroundColor: Colors.accentAlpha,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    paddingLeft: 13,
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
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
  endSessionButton: {
    height: 44,
    marginTop: 14,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.border.default,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  endSessionButtonPressed: {
    borderColor: Colors.border.strong,
  },
  endSessionButtonText: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
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
  portalPrimaryButton: {
    height: 50,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    ...Shadow.glow,
  },
  portalPrimaryButtonPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: Colors.accentDark,
  },
  portalPrimaryButtonText: {
    color: Colors.text.primary,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  portalSecondaryButton: {
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.border.accent,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.xxxl,
    minHeight: 44,
  },
  portalSecondaryButtonPressed: {
    opacity: 0.85,
  },
  portalSecondaryButtonText: {
    color: Colors.text.accent,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  loadingButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bg.hover,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
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
    width: "100%",
    height: 50,
    borderRadius: Radius.md,
    marginTop: 18,
    backgroundColor: Colors.accentAlpha,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  reprintOverlayDoneButtonPressed: {
    opacity: 0.85,
  },
  reprintOverlayDoneText: {
    color: Colors.text.accent,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
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
