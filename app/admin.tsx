import { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getPriceHistory, type PriceChange } from "../src/services/PriceHistoryService";
import {
  getCurrentSession,
  getSessionHistory,
  isSessionActive,
  type SlipSession,
} from "../src/services/SlipCounterService";
import {
  getInvoices,
  saveInvoice,
  formatSlipDateTime,
  storageKeyToProductType,
  type StoredInvoice,
} from "../src/services/InvoiceHistoryService";
import { usePrinterContext } from "../contexts/PrinterContext";
import { formatCurrency, generateInvoiceNumber } from "../utils/formatters";
import type { ReceiptData } from "../utils/generateReceipt";
import { colors, spacing } from "../constants/theme";

type Tab = "invoices" | "price" | "slips";
type DateFilter = "all" | "today" | "week";

const PRODUCT_COLORS: Record<PriceChange["product"], string> = {
  PETROL: "#22c55e",
  DIESEL: "#3b82f6",
  "HI-OCTANE": "#a855f7",
};

const INVOICE_BADGE_STYLES: Record<
  string,
  { backgroundColor: string; color: string }
> = {
  PETROL: { backgroundColor: "#dcfce7", color: "#16a34a" },
  DIESEL: { backgroundColor: "#dbeafe", color: "#1d4ed8" },
  "HI-OCTANE": { backgroundColor: "#f3e8ff", color: "#7e22ce" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function formatSessionTime(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const fmt = (d: Date) => {
    const hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const period = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12;
    return `${String(hours12).padStart(2, "0")}:${minutes} ${period}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(
      d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    );
  }
  return days;
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

export default function AdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const printer = usePrinterContext();
  const [activeTab, setActiveTab] = useState<Tab>("invoices");
  const [loading, setLoading] = useState(true);
  const [priceHistory, setPriceHistory] = useState<PriceChange[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SlipSession[]>([]);
  const [invoices, setInvoices] = useState<StoredInvoice[]>([]);
  const [currentSession, setCurrentSession] = useState<{
    startTime: string;
    count: number;
    isActive: boolean;
  } | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [reprintingId, setReprintingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [history, sessions, active, current, invoiceList] = await Promise.all([
      getPriceHistory(),
      getSessionHistory(),
      isSessionActive(),
      getCurrentSession(),
      getInvoices(),
    ]);
    setPriceHistory(history);
    setSessionHistory(sessions);
    setSessionActive(active);
    setCurrentSession(current);
    setInvoices(invoiceList);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const originalInvoices = useMemo(
    () => invoices.filter((inv) => !inv.isDuplicate),
    [invoices]
  );

  const invoiceStats = useMemo(() => {
    const today = originalInvoices.filter((inv) => isPrintedToday(inv.printedAt)).length;
    const week = originalInvoices.filter((inv) => isPrintedThisWeek(inv.printedAt)).length;
    return { today, week, total: originalInvoices.length };
  }, [originalInvoices]);

  const filteredInvoices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return originalInvoices.filter((inv) => {
      if (dateFilter === "today" && !isPrintedToday(inv.printedAt)) return false;
      if (dateFilter === "week" && !isPrintedThisWeek(inv.printedAt)) return false;
      if (!query) return true;
      return (
        inv.vehicleNo.toLowerCase().includes(query) ||
        inv.dateTime.toLowerCase().includes(query)
      );
    });
  }, [originalInvoices, searchQuery, dateFilter]);

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

        const updated = await getInvoices();
        setInvoices(updated);
      } catch {
        Alert.alert("Print Failed", "Could not print. Check printer connection.");
      } finally {
        setReprintingId(null);
      }
    },
    [printer]
  );

  const weekTotal =
    sessionHistory.reduce((sum, s) => sum + s.count, 0) +
    (sessionActive && currentSession ? currentSession.count : 0);
  const last7Days = getLast7Days();

  const sessionByDate = sessionHistory.reduce<Record<string, SlipSession>>((acc, session) => {
    acc[session.date] = session;
    return acc;
  }, {});

  const renderInvoiceTab = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.invoiceScrollContent}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by vehicle or date..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <View style={styles.filterRow}>
          {(["all", "today", "week"] as const).map((filter) => (
            <Pressable
              key={filter}
              onPress={() => setDateFilter(filter)}
              style={[styles.filterChip, dateFilter === filter && styles.filterChipActive]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  dateFilter === filter && styles.filterChipTextActive,
                ]}
              >
                {filter === "all" ? "All" : filter === "today" ? "Today" : "This Week"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Today</Text>
            <Text style={styles.statValue}>{invoiceStats.today} originals</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>This Week</Text>
            <Text style={styles.statValue}>{invoiceStats.week} originals</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total</Text>
            <Text style={styles.statValue}>{invoiceStats.total} originals</Text>
          </View>
        </View>

        {filteredInvoices.length === 0 ? (
          <View style={styles.invoiceEmpty}>
            <Text style={styles.invoiceEmptyIcon}>🧾</Text>
            <Text style={styles.invoiceEmptyTitle}>No invoices yet</Text>
            <Text style={styles.invoiceEmptySubtitle}>Printed receipts will appear here</Text>
          </View>
        ) : (
          filteredInvoices.map((invoice) => {
            const badgeStyle =
              INVOICE_BADGE_STYLES[invoice.product] ?? INVOICE_BADGE_STYLES.PETROL;
            return (
              <View key={invoice.id} style={styles.invoiceCard}>
                <View style={styles.invoiceCardTop}>
                  <View style={[styles.invoiceProductBadge, { backgroundColor: badgeStyle.backgroundColor }]}>
                    <Text style={[styles.invoiceProductText, { color: badgeStyle.color }]}>
                      {invoice.product}
                    </Text>
                  </View>
                  <Text style={styles.invoiceDateTime}>{invoice.dateTime}</Text>
                </View>

                <View style={styles.invoiceDetailRow}>
                  <Text style={styles.invoiceDetailText}>
                    Volume: {invoice.volume} LTR
                  </Text>
                  <Text style={styles.invoiceDetailText}>
                    Rate: {formatCurrency(invoice.rate)}
                  </Text>
                </View>

                <Text style={styles.invoiceTotal}>
                  TOTAL: {formatCurrency(invoice.totalAmount)}
                </Text>

                <View style={styles.invoiceCardBottom}>
                  <View style={styles.invoiceCardBottomLeft}>
                    <Text
                      style={[
                        styles.invoiceVehicle,
                        !invoice.vehicleNo.trim() && styles.invoiceVehicleEmpty,
                      ]}
                    >
                      {invoice.vehicleNo.trim() ? `Vehicle: ${invoice.vehicleNo}` : "No Vehicle"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleReprint(invoice)}
                    disabled={reprintingId === invoice.id}
                    style={[
                      styles.printButton,
                      reprintingId === invoice.id && styles.printButtonDisabled,
                    ]}
                  >
                    {reprintingId === invoice.id ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={styles.printButtonText}>🖨️</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/")} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>← Home</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <Pressable onPress={() => router.replace("/")} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setActiveTab("invoices")}
          style={[styles.tab, activeTab === "invoices" && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === "invoices" && styles.tabTextActive]}>
            Invoices
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("price")}
          style={[styles.tab, activeTab === "price" && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === "price" && styles.tabTextActive]}>
            Price History
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("slips")}
          style={[styles.tab, activeTab === "slips" && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === "slips" && styles.tabTextActive]}>
            Slip Counter
          </Text>
        </Pressable>
      </View>

      {activeTab === "invoices" ? (
        renderInvoiceTab()
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : activeTab === "price" ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {priceHistory.length === 0 ? (
            <Text style={styles.emptyText}>No price changes recorded yet</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, styles.colProduct]}>Product</Text>
                <Text style={[styles.tableHeaderCell, styles.colPrice]}>Old Price</Text>
                <Text style={[styles.tableHeaderCell, styles.colPrice]}>New Price</Text>
                <Text style={[styles.tableHeaderCell, styles.colDate]}>Date & Time</Text>
              </View>
              {priceHistory.map((row, index) => (
                <View
                  key={row.id}
                  style={[styles.tableRow, index % 2 === 0 ? styles.rowEven : styles.rowOdd]}
                >
                  <View style={[styles.colProduct, styles.cellProduct]}>
                    <View
                      style={[styles.productBadge, { backgroundColor: PRODUCT_COLORS[row.product] }]}
                    >
                      <Text style={styles.productBadgeText}>{row.product}</Text>
                    </View>
                  </View>
                  <Text style={[styles.colPrice, styles.oldPrice]}>
                    {formatCurrency(row.oldPrice)}
                  </Text>
                  <Text style={[styles.colPrice, styles.newPrice]}>
                    {formatCurrency(row.newPrice)}
                  </Text>
                  <Text style={[styles.colDate, styles.dateText]}>
                    {formatDateTime(row.changedAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Current Session</Text>
            {sessionActive && currentSession ? (
              <>
                <Text style={styles.summaryLine}>
                  Started: {formatDateTime(currentSession.startTime)}
                </Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLine}>Slips: {currentSession.count}</Text>
                  <Text style={styles.activeIndicator}>Active ●</Text>
                </View>
              </>
            ) : (
              <Text style={styles.summaryLine}>No active session</Text>
            )}
          </View>

          {sessionHistory.length === 0 && !sessionActive ? (
            <Text style={styles.emptyText}>No slip sessions recorded yet</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, styles.colSlipDate]}>Date</Text>
                <Text style={[styles.tableHeaderCell, styles.colSlipCount]}>Slips Printed</Text>
                <Text style={[styles.tableHeaderCell, styles.colSlipTime]}>Session Time</Text>
              </View>
              {last7Days.map((day, index) => {
                const session = sessionByDate[day];
                return (
                  <View
                    key={day}
                    style={[styles.tableRow, index % 2 === 0 ? styles.rowEven : styles.rowOdd]}
                  >
                    <Text style={[styles.colSlipDate, styles.cellText]}>{day}</Text>
                    <Text style={[styles.colSlipCount, styles.cellText, styles.cellCenter]}>
                      {session ? session.count : "-"}
                    </Text>
                    <Text style={[styles.colSlipTime, styles.cellText, styles.cellSmall]}>
                      {session ? formatSessionTime(session.startTime, session.endTime) : "-"}
                    </Text>
                  </View>
                );
              })}
              <View style={styles.totalRow}>
                <Text style={styles.totalText}>Total this week: {weekTotal} slips</Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.black,
  },
  headerButton: {
    padding: spacing.sm,
    minWidth: 72,
  },
  headerButtonText: {
    color: "#1a56db",
    fontSize: 14,
    fontWeight: "600",
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#1a56db",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.muted,
  },
  tabTextActive: {
    color: "#1a56db",
    fontWeight: "700",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  invoiceScrollContent: {
    paddingBottom: spacing.xxl,
  },
  searchInput: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.black,
  },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: "#1a56db",
    borderColor: "#1a56db",
  },
  filterChipText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: "500",
  },
  filterChipTextActive: {
    color: colors.white,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.black,
  },
  invoiceEmpty: {
    alignItems: "center",
    paddingTop: spacing.xxl * 2,
    paddingHorizontal: spacing.lg,
  },
  invoiceEmptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  invoiceEmptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.black,
    marginBottom: 4,
  },
  invoiceEmptySubtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  invoiceCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
  },
  invoiceCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  invoiceProductBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  invoiceProductText: {
    fontSize: 11,
    fontWeight: "700",
  },
  invoiceDateTime: {
    fontSize: 11,
    color: colors.muted,
  },
  invoiceDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  invoiceDetailText: {
    fontSize: 13,
    color: colors.black,
  },
  invoiceTotal: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.black,
    marginBottom: 10,
  },
  invoiceCardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  invoiceCardBottomLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  invoiceVehicle: {
    fontSize: 13,
    color: colors.black,
  },
  invoiceVehicleEmpty: {
    color: colors.muted,
  },
  printButton: {
    backgroundColor: "#1a56db",
    borderRadius: 8,
    padding: 8,
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  printButtonDisabled: {
    opacity: 0.7,
  },
  printButtonText: {
    fontSize: 16,
  },
  emptyText: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 15,
    marginTop: spacing.xxl,
  },
  table: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#1a56db",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  tableHeaderCell: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 11,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
  },
  rowEven: {
    backgroundColor: "#f8f9fa",
  },
  rowOdd: {
    backgroundColor: colors.white,
  },
  colProduct: {
    flex: 1.2,
  },
  colPrice: {
    flex: 1,
    fontSize: 11,
  },
  colDate: {
    flex: 1.5,
    fontSize: 10,
  },
  colSlipDate: {
    flex: 1.2,
  },
  colSlipCount: {
    flex: 0.8,
  },
  colSlipTime: {
    flex: 1.5,
  },
  cellProduct: {
    justifyContent: "center",
  },
  productBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  productBadgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: "700",
  },
  oldPrice: {
    color: colors.muted,
    textDecorationLine: "line-through",
    fontSize: 11,
  },
  newPrice: {
    color: colors.black,
    fontWeight: "700",
    fontSize: 11,
  },
  dateText: {
    color: colors.black,
    fontSize: 10,
  },
  cellText: {
    fontSize: 12,
    color: colors.black,
  },
  cellCenter: {
    textAlign: "center",
  },
  cellSmall: {
    fontSize: 10,
  },
  summaryCard: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.black,
    marginBottom: spacing.sm,
  },
  summaryLine: {
    fontSize: 14,
    color: colors.black,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activeIndicator: {
    color: "#22c55e",
    fontWeight: "600",
    fontSize: 14,
  },
  totalRow: {
    backgroundColor: "#f8f9fa",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalText: {
    fontWeight: "700",
    fontSize: 14,
    color: colors.black,
  },
});
