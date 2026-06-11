import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
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
import { formatCurrency } from "../utils/formatters";
import { colors, spacing } from "../constants/theme";

type Tab = "price" | "slips";

const PRODUCT_COLORS: Record<PriceChange["product"], string> = {
  PETROL: "#22c55e",
  DIESEL: "#3b82f6",
  "HI-OCTANE": "#a855f7",
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

export default function AdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("price");
  const [loading, setLoading] = useState(true);
  const [priceHistory, setPriceHistory] = useState<PriceChange[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SlipSession[]>([]);
  const [currentSession, setCurrentSession] = useState<{
    startTime: string;
    count: number;
    isActive: boolean;
  } | null>(null);
  const [sessionActive, setSessionActive] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [history, sessions, active, current] = await Promise.all([
      getPriceHistory(),
      getSessionHistory(),
      isSessionActive(),
      getCurrentSession(),
    ]);
    setPriceHistory(history);
    setSessionHistory(sessions);
    setSessionActive(active);
    setCurrentSession(current);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const weekTotal =
    sessionHistory.reduce((sum, s) => sum + s.count, 0) +
    (sessionActive && currentSession ? currentSession.count : 0);
  const last7Days = getLast7Days();

  const sessionByDate = sessionHistory.reduce<Record<string, SlipSession>>((acc, session) => {
    acc[session.date] = session;
    return acc;
  }, {});

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

      {loading ? (
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
    fontSize: 14,
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
