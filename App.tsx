import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "Home" | "Transactions" | "Budget" | "Reports" | "Profile";

type HomeResponse = {
  monthly_summary: {
    month: number;
    year: number;
    income: number;
    expense: number;
    savings: number;
    category_breakdown: Record<string, number>;
    daily_spending: Record<string, number>;
  };
  budget_alerts: string[];
  low_balance_warning: string | null;
};

type Transaction = {
  id: number;
  amount: number;
  type: string;
  merchant: string;
  category: string;
  date: string;
};

type BudgetAlertsResponse = {
  spending_by_category: Record<string, number>;
  alerts: string[];
  carry_forward_savings: number;
};

type AnalyticsResponse = {
  expense: number;
  category_breakdown: Record<string, number>;
  daily_spending: Record<string, number>;
  top_categories_week: { category: string; amount: number }[];
};

type SemesterResponse = {
  semester: number;
  year: number;
  count: number;
  expense: number;
  income: number;
  net: number;
};

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE_URL = Platform.select({
  android: "http://10.0.2.2:8000",
  ios: "http://127.0.0.1:8000",
  default: "http://127.0.0.1:8000",
});

const TABS: Tab[] = ["Home", "Transactions", "Budget", "Reports", "Profile"];

const TAB_ICONS: Record<Tab, string> = {
  Home: "⌂",
  Transactions: "↕",
  Budget: "◎",
  Reports: "▦",
  Profile: "○",
};

const CATEGORIES = ["Food", "Transport", "Study", "Entertainment", "Other"];

const BUDGET_LIMITS: Record<string, number> = {
  Food: 4000,
  Transport: 2000,
  Entertainment: 1500,
  Study: 3000,
  Other: 2000,
};

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:             "#0B1220",
  surface:        "#111B31",
  surfaceAlt:     "#162040",
  border:         "#1E2D4A",

  textPrimary:    "#E2E8F0",
  textSecondary:  "#94A3B8",
  textMuted:      "#4A5568",

  income:         "#4ADE80",
  incomeSubtle:   "#0D2818",
  expense:        "#F87171",
  expenseSubtle:  "#2D1010",
  savings:        "#60A5FA",
  savingsSubtle:  "#0A1F3D",

  accent:         "#4ADE80",
  warning:        "#FBBF24",
  warningSubtle:  "#2D1F05",

  catFood:          "#FB923C",
  catTransport:     "#A78BFA",
  catStudy:         "#34D399",
  catEntertainment: "#F472B6",
  catIncome:        "#4ADE80",
  catOther:         "#94A3B8",
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function categoryColor(cat: string): string {
  const map: Record<string, string> = {
    Food:          C.catFood,
    Transport:     C.catTransport,
    Study:         C.catStudy,
    Entertainment: C.catEntertainment,
    Income:        C.catIncome,
  };
  return map[cat] ?? C.catOther;
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function currentMonthLabel(): string {
  return new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function useCountUp(target: number, duration = 800): number {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (target === 0) {
      setCurrent(0);
      return;
    }
    const steps = 30;
    const increment = target / steps;
    const intervalMs = duration / steps;
    let count = 0;

    const timer = setInterval(() => {
      count += increment;
      if (count >= target) {
        setCurrent(target);
        clearInterval(timer);
      } else {
        setCurrent(Math.round(count));
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [target, duration]);

  return current;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T> {
  const base = API_BASE_URL ?? "http://127.0.0.1:8000";
  const res = await fetch(`${base}${path}`);

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {}
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: object): Promise<T> {
  const base = API_BASE_URL ?? "http://127.0.0.1:8000";
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const b = (await res.json()) as { detail?: string };
      if (b.detail) message = b.detail;
    } catch {}
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab]       = useState<Tab>("Home");
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [homeData, setHomeData]         = useState<HomeResponse | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgetData, setBudgetData]     = useState<BudgetAlertsResponse | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null);
  const [semesterData, setSemesterData] = useState<SemesterResponse | null>(null);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const semester = now.getMonth() < 6 ? 1 : 2;
      const year = now.getFullYear();

      const [home, txn, budget, analytics, sem] = await Promise.all([
        fetchJson<HomeResponse>("/dashboard/home"),
        fetchJson<Transaction[]>("/transactions/"),
        fetchJson<BudgetAlertsResponse>("/budgets/alerts"),
        fetchJson<AnalyticsResponse>("/dashboard/analytics"),
        fetchJson<SemesterResponse>(`/reports/semester?semester=${semester}&year=${year}`),
      ]);

      setHomeData(home);
      setTransactions(txn);
      setBudgetData(budget);
      setAnalyticsData(analytics);
      setSemesterData(sem);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const screen = useMemo(() => {
    switch (activeTab) {
      case "Home":
        return <HomeScreen loading={loading} error={error} onRefresh={refreshAll} homeData={homeData} />;
      case "Transactions":
        return <TransactionsScreen loading={loading} error={error} onRefresh={refreshAll} transactions={transactions} />;
      case "Budget":
        return <BudgetScreen loading={loading} error={error} onRefresh={refreshAll} budgetData={budgetData} />;
      case "Reports":
        return <ReportsScreen loading={loading} error={error} onRefresh={refreshAll} analyticsData={analyticsData} semesterData={semesterData} />;
      case "Profile":
        return <ProfileScreen apiBaseUrl={API_BASE_URL ?? "http://127.0.0.1:8000"} />;
    }
  }, [activeTab, analyticsData, budgetData, error, homeData, loading, refreshAll, semesterData, transactions]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        {screen}
      </View>

      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg, paddingBottom: 4 }}>
        {TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{ flex: 1, alignItems: "center", paddingVertical: 10 }}
              activeOpacity={0.7}
            >
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: active ? C.accent : "transparent", marginBottom: 4 }} />
              <Text style={{ fontSize: 18, color: active ? C.accent : C.textMuted }}>{TAB_ICONS[tab]}</Text>
              <Text style={{ fontSize: 10, fontWeight: active ? "700" : "400", color: active ? C.accent : C.textMuted, marginTop: 2, letterSpacing: 0.3 }}>
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function ScreenHeader({ title, subtitle, onRefresh }: { title: string; subtitle?: string; onRefresh: () => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingTop: 4 }}>
      <View>
        <Text style={{ color: C.textPrimary, fontSize: 26, fontWeight: "700", letterSpacing: -0.5 }}>{title}</Text>
        {subtitle && <Text style={{ color: C.textSecondary, fontSize: 13, marginTop: 2 }}>{subtitle}</Text>}
      </View>
      <TouchableOpacity
        onPress={onRefresh}
        activeOpacity={0.7}
        style={{ backgroundColor: C.surfaceAlt, borderRadius: 20, width: 36, height: 36, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border, marginTop: 4 }}
      >
        <Text style={{ color: C.accent, fontSize: 16 }}>↻</Text>
      </TouchableOpacity>
    </View>
  );
}

function LoadState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <View style={{ paddingVertical: 32, alignItems: "center" }}>
        <ActivityIndicator color={C.accent} size="small" />
        <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 10 }}>Loading…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ backgroundColor: C.expenseSubtle, borderRadius: 12, borderWidth: 1, borderLeftWidth: 3, borderColor: C.expense, borderLeftColor: C.expense, padding: 14, marginBottom: 14 }}>
        <Text style={{ color: C.expense, fontWeight: "700", fontSize: 13, marginBottom: 4 }}>Connection error</Text>
        <Text style={{ color: "#FECACA", fontSize: 13, lineHeight: 18 }}>{error}</Text>
        <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 6 }}>Make sure your backend is running on port 8000.</Text>
      </View>
    );
  }

  return null;
}

function StatCard({ label, value, accent, subtle }: { label: string; value: string; accent: string; subtle: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: subtle, borderRadius: 14, borderWidth: 1, borderColor: accent + "33", borderTopWidth: 3, borderTopColor: accent, padding: 14, minHeight: 80, justifyContent: "space-between" }}>
      <Text style={{ color: accent, fontSize: 11, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ color: C.textPrimary, fontSize: 20, fontWeight: "700", marginTop: 8, letterSpacing: -0.3 }}>{value}</Text>
    </View>
  );
}

function AnimatedStatCard({ label, numericValue, accent, subtle, fullWidth = false }: { label: string; numericValue: number | null; accent: string; subtle: string; fullWidth?: boolean }) {
  const animated = useCountUp(numericValue ?? 0);
  return (
    <View style={{ flex: fullWidth ? undefined : 1, backgroundColor: subtle, borderRadius: 14, borderWidth: 1, borderColor: accent + "33", borderTopWidth: 3, borderTopColor: accent, padding: 14, minHeight: 80, justifyContent: "space-between" }}>
      <Text style={{ color: accent, fontSize: 11, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ color: C.textPrimary, fontSize: 20, fontWeight: "700", marginTop: 8, letterSpacing: -0.3 }}>
        {numericValue !== null ? formatCurrency(animated) : "—"}
      </Text>
    </View>
  );
}

function InfoCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 }}>
      <Text style={{ color: C.textSecondary, fontSize: 12, marginBottom: 6, fontWeight: "500" }}>{label}</Text>
      <Text style={{ color: accent ?? C.textPrimary, fontSize: 15, fontWeight: "600", lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

function CategoryPill({ category }: { category: string }) {
  const color = categoryColor(category);
  return (
    <View style={{ backgroundColor: color + "22", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text style={{ color, fontSize: 11, fontWeight: "600" }}>{category}</Text>
    </View>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, marginTop: 6 }}>
      {text}
    </Text>
  );
}

function SimpleBarChart({ data, title }: { data: Record<string, number>; title: string }) {
  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).slice(-7);
  const maxVal = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 10 }}>
      <Text style={{ color: C.textSecondary, fontSize: 12, fontWeight: "500", marginBottom: 16 }}>{title}</Text>

      {entries.length === 0 ? (
        <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 16 }}>No data yet</Text>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "flex-end", height: 90, gap: 6 }}>
          {entries.map(([day, val]) => {
            const ratio = val / maxVal;
            const barHeight = Math.max(ratio * 90, 4);
            const barColor = ratio > 0.8 ? C.expense : ratio > 0.5 ? C.warning : C.income;
            return (
              <View key={day} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: 90 }}>
                <Text style={{ color: C.textMuted, fontSize: 9, marginBottom: 3 }}>{formatCurrency(val).replace("₹", "")}</Text>
                <View style={{ width: "80%", height: barHeight, backgroundColor: barColor, borderRadius: 4, opacity: 0.85 }} />
                <Text style={{ color: C.textMuted, fontSize: 9, marginTop: 5 }}>{day.slice(5)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Add Transaction Modal ─────────────────────────────────────────────────────

function AddTransactionModal({ visible, onClose, onSuccess }: { visible: boolean; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount]     = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("Food");
  const [type, setType]         = useState<"income" | "expense">("expense");
  const [date, setDate]         = useState(todayString());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);

  const reset = () => {
    setAmount("");
    setMerchant("");
    setCategory("Food");
    setType("expense");
    setDate(todayString());
    setFormError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setFormError("Enter a valid amount.");
      return;
    }
    if (!merchant.trim()) {
      setFormError("Enter a merchant or description.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await postJson("/transactions/", {
        amount: parseFloat(amount),
        type,
        merchant: merchant.trim(),
        category: type === "income" ? "Income" : category,
        date,
      });
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.65)" }}
      >
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderTopWidth: 1, borderColor: C.border }}>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <Text style={{ color: C.textPrimary, fontSize: 18, fontWeight: "700" }}>Add Transaction</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
              <Text style={{ color: C.textMuted, fontSize: 22, lineHeight: 26 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", backgroundColor: C.bg, borderRadius: 10, padding: 3, marginBottom: 18 }}>
            {(["expense", "income"] as const).map((t) => {
              const active = type === t;
              const color = t === "income" ? C.income : C.expense;
              const subtle = t === "income" ? C.incomeSubtle : C.expenseSubtle;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setType(t)}
                  activeOpacity={0.8}
                  style={{ flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 8, backgroundColor: active ? subtle : "transparent", borderWidth: active ? 1 : 0, borderColor: active ? color : "transparent" }}
                >
                  <Text style={{ color: active ? color : C.textMuted, fontWeight: "600", fontSize: 13, textTransform: "capitalize" }}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={{ color: C.textSecondary, fontSize: 12, fontWeight: "500", marginBottom: 6 }}>Amount (₹)</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={C.textMuted}
            style={{ backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border, color: C.textPrimary, fontSize: 20, fontWeight: "700", padding: 12, marginBottom: 14 }}
          />

          <Text style={{ color: C.textSecondary, fontSize: 12, fontWeight: "500", marginBottom: 6 }}>Merchant / Description</Text>
          <TextInput
            value={merchant}
            onChangeText={setMerchant}
            placeholder="e.g. Zomato, Amazon Books"
            placeholderTextColor={C.textMuted}
            style={{ backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border, color: C.textPrimary, fontSize: 15, padding: 12, marginBottom: 14 }}
          />

          {type === "expense" && (
            <>
              <Text style={{ color: C.textSecondary, fontSize: 12, fontWeight: "500", marginBottom: 6 }}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {CATEGORIES.map((cat) => {
                    const active = category === cat;
                    const color = categoryColor(cat);
                    return (
                      <TouchableOpacity
                        key={cat}
                        onPress={() => setCategory(cat)}
                        activeOpacity={0.7}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? color + "22" : C.bg, borderWidth: 1, borderColor: active ? color : C.border }}
                      >
                        <Text style={{ color: active ? color : C.textMuted, fontWeight: "600", fontSize: 13 }}>{cat}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </>
          )}

          <Text style={{ color: C.textSecondary, fontSize: 12, fontWeight: "500", marginBottom: 6 }}>Date (YYYY-MM-DD)</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="2026-06-19"
            placeholderTextColor={C.textMuted}
            style={{ backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border, color: C.textPrimary, fontSize: 15, padding: 12, marginBottom: 18 }}
          />

          {formError && (
            <Text style={{ color: C.expense, fontSize: 13, marginBottom: 12 }}>⚠  {formError}</Text>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
            style={{ backgroundColor: type === "income" ? C.income : C.accent, borderRadius: 12, padding: 16, alignItems: "center", opacity: submitting ? 0.7 : 1 }}
          >
            {submitting
              ? <ActivityIndicator color={C.bg} />
              : <Text style={{ color: C.bg, fontWeight: "700", fontSize: 15 }}>Save {type === "income" ? "Income" : "Expense"}</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────

function HomeScreen({ loading, error, onRefresh, homeData }: { loading: boolean; error: string | null; onRefresh: () => void; homeData: HomeResponse | null }) {
  const summary = homeData?.monthly_summary;
  const hasAlerts = (homeData?.budget_alerts.length ?? 0) > 0;
  const hasLowBalance = !!homeData?.low_balance_warning;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />}
    >
      <ScreenHeader title="Dashboard" subtitle={currentMonthLabel()} onRefresh={onRefresh} />
      <LoadState loading={loading} error={error} />

      {!loading && (
        <>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            <AnimatedStatCard label="Income"  numericValue={summary?.income  ?? null} accent={C.income}  subtle={C.incomeSubtle}  />
            <AnimatedStatCard label="Expense" numericValue={summary?.expense ?? null} accent={C.expense} subtle={C.expenseSubtle} />
          </View>
          <AnimatedStatCard label="Savings this month" numericValue={summary?.savings ?? null} accent={C.savings} subtle={C.savingsSubtle} fullWidth />

          <View style={{ height: 16 }} />
          <SectionLabel text="Alerts" />

          <View style={{ backgroundColor: hasAlerts ? C.warningSubtle : C.surface, borderRadius: 12, borderWidth: 1, borderLeftWidth: hasAlerts ? 3 : 1, borderColor: hasAlerts ? C.warning + "55" : C.border, borderLeftColor: hasAlerts ? C.warning : C.border, padding: 14, marginBottom: 10 }}>
            <Text style={{ color: hasAlerts ? C.warning : C.textMuted, fontSize: 13, fontWeight: "600", marginBottom: 2 }}>
              {hasAlerts ? "⚠  Budget alert" : "Budget"}
            </Text>
            <Text style={{ color: hasAlerts ? "#FDE68A" : C.textMuted, fontSize: 13, lineHeight: 18 }}>
              {hasAlerts ? homeData!.budget_alerts[0] : "No active alerts"}
            </Text>
          </View>

          <View style={{ backgroundColor: hasLowBalance ? C.expenseSubtle : C.surface, borderRadius: 12, borderWidth: 1, borderLeftWidth: hasLowBalance ? 3 : 1, borderColor: hasLowBalance ? C.expense + "55" : C.border, borderLeftColor: hasLowBalance ? C.expense : C.border, padding: 14, marginBottom: 10 }}>
            <Text style={{ color: hasLowBalance ? C.expense : C.textMuted, fontSize: 13, fontWeight: "600", marginBottom: 2 }}>
              {hasLowBalance ? "⚡  Low balance" : "Balance"}
            </Text>
            <Text style={{ color: hasLowBalance ? "#FECACA" : C.textMuted, fontSize: 13 }}>
              {homeData?.low_balance_warning ?? "Balance looks healthy"}
            </Text>
          </View>

          {summary && Object.keys(summary.category_breakdown).length > 0 && (
            <>
              <View style={{ height: 6 }} />
              <SectionLabel text="Spending by category" />
              {Object.entries(summary.category_breakdown).map(([cat, amt]) => (
                <View key={cat} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border }}>
                  <CategoryPill category={cat} />
                  <Text style={{ color: C.expense, fontWeight: "700", fontSize: 14 }}>{formatCurrency(amt)}</Text>
                </View>
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ── Transactions Screen ───────────────────────────────────────────────────────

function TransactionCard({ transaction }: { transaction: Transaction }) {
  const isIncome = transaction.type === "income";
  const amountColor = isIncome ? C.income : C.expense;

  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: amountColor, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ color: C.textPrimary, fontSize: 15, fontWeight: "600", marginBottom: 4 }}>{transaction.merchant}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <CategoryPill category={transaction.category} />
          <Text style={{ color: C.textMuted, fontSize: 11 }}>{transaction.date}</Text>
        </View>
      </View>
      <Text style={{ color: amountColor, fontSize: 16, fontWeight: "700", letterSpacing: -0.3 }}>
        {isIncome ? "+" : "−"}{formatCurrency(transaction.amount)}
      </Text>
    </View>
  );
}

function TransactionsScreen({ loading, error, onRefresh, transactions }: { loading: boolean; error: string | null; onRefresh: () => void; transactions: Transaction[] }) {
  const [modalVisible, setModalVisible] = useState(false);
  const expenses = transactions.filter((t) => t.type === "expense");
  const income   = transactions.filter((t) => t.type === "income");

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />}
      >
        <ScreenHeader title="Transactions" subtitle={`${transactions.length} records`} onRefresh={onRefresh} />
        <LoadState loading={loading} error={error} />

        {!loading && transactions.length === 0 && !error && (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <Text style={{ color: C.textMuted, fontSize: 36, marginBottom: 12 }}>↕</Text>
            <Text style={{ color: C.textSecondary, fontSize: 15, fontWeight: "600" }}>No transactions yet</Text>
            <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>Tap + to add your first one.</Text>
          </View>
        )}

        {expenses.length > 0 && (
          <>
            <SectionLabel text="Expenses" />
            {expenses.slice(0, 20).map((t) => <TransactionCard key={String(t.id)} transaction={t} />)}
          </>
        )}

        {income.length > 0 && (
          <>
            <View style={{ height: 6 }} />
            <SectionLabel text="Income" />
            {income.slice(0, 10).map((t) => <TransactionCard key={String(t.id)} transaction={t} />)}
          </>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
        style={{ position: "absolute", bottom: 16, right: 0, width: 54, height: 54, borderRadius: 27, backgroundColor: C.accent, alignItems: "center", justifyContent: "center", shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 10 }}
      >
        <Text style={{ color: C.bg, fontSize: 28, fontWeight: "700", lineHeight: 32 }}>+</Text>
      </TouchableOpacity>

      <AddTransactionModal visible={modalVisible} onClose={() => setModalVisible(false)} onSuccess={onRefresh} />
    </View>
  );
}

// ── Budget Screen ─────────────────────────────────────────────────────────────

function BudgetProgressBar({ category, spent, limit }: { category: string; spent: number; limit: number }) {
  const pct = Math.min(spent / limit, 1);
  const color = pct >= 0.9 ? C.expense : pct >= 0.7 ? C.warning : C.income;

  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <CategoryPill category={category} />
        <Text style={{ color: C.textSecondary, fontSize: 12 }}>
          <Text style={{ color: C.textPrimary, fontWeight: "700" }}>{formatCurrency(spent)}</Text>
          {" / "}{formatCurrency(limit)}
        </Text>
      </View>
      <View style={{ height: 5, backgroundColor: C.surfaceAlt, borderRadius: 3, overflow: "hidden" }}>
        <View style={{ height: 5, width: `${pct * 100}%`, backgroundColor: color, borderRadius: 3 }} />
      </View>
      <Text style={{ color: C.textMuted, fontSize: 11, marginTop: 6, textAlign: "right" }}>{Math.round(pct * 100)}% used</Text>
    </View>
  );
}

function BudgetScreen({ loading, error, onRefresh, budgetData }: { loading: boolean; error: string | null; onRefresh: () => void; budgetData: BudgetAlertsResponse | null }) {
  const categories = Object.entries(budgetData?.spending_by_category ?? {});

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />}
    >
      <ScreenHeader title="Budget" subtitle={currentMonthLabel()} onRefresh={onRefresh} />
      <LoadState loading={loading} error={error} />

      {!loading && (
        <>
          <View style={{ backgroundColor: C.incomeSubtle, borderRadius: 14, borderWidth: 1, borderColor: C.income + "33", borderTopWidth: 3, borderTopColor: C.income, padding: 14, marginBottom: 16 }}>
            <Text style={{ color: C.income, fontSize: 11, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" }}>Carry-forward savings</Text>
            <Text style={{ color: C.textPrimary, fontSize: 22, fontWeight: "700", marginTop: 6 }}>{formatCurrency(budgetData?.carry_forward_savings ?? 0)}</Text>
            <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>From last month</Text>
          </View>

          {(budgetData?.alerts.length ?? 0) > 0 && (
            <>
              <SectionLabel text="Active alerts" />
              {budgetData!.alerts.map((alert, i) => (
                <View key={i} style={{ backgroundColor: C.warningSubtle, borderRadius: 10, borderWidth: 1, borderColor: C.warning + "55", borderLeftWidth: 3, borderLeftColor: C.warning, padding: 12, marginBottom: 8 }}>
                  <Text style={{ color: "#FDE68A", fontSize: 13 }}>⚠  {alert}</Text>
                </View>
              ))}
              <View style={{ height: 6 }} />
            </>
          )}

          <SectionLabel text="Spending vs budget" />
          {categories.map(([cat, spent]) => (
            <BudgetProgressBar key={cat} category={cat} spent={spent} limit={BUDGET_LIMITS[cat] ?? 2000} />
          ))}
          {categories.length === 0 && (
            <Text style={{ color: C.textMuted, fontSize: 13, textAlign: "center", paddingVertical: 32 }}>No spending data yet this month.</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ── Reports Screen ────────────────────────────────────────────────────────────

function ReportsScreen({ loading, error, onRefresh, analyticsData, semesterData }: { loading: boolean; error: string | null; onRefresh: () => void; analyticsData: AnalyticsResponse | null; semesterData: SemesterResponse | null }) {
  const topCategory = analyticsData?.top_categories_week?.[0];

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />}
    >
      <ScreenHeader title="Reports" subtitle={semesterData ? `Semester ${semesterData.semester}, ${semesterData.year}` : undefined} onRefresh={onRefresh} />
      <LoadState loading={loading} error={error} />

      {!loading && (
        <>
          <SectionLabel text="Semester overview" />
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            <StatCard label="Income"  value={semesterData ? formatCurrency(semesterData.income)  : "—"} accent={C.income}  subtle={C.incomeSubtle}  />
            <StatCard label="Expense" value={semesterData ? formatCurrency(semesterData.expense) : "—"} accent={C.expense} subtle={C.expenseSubtle} />
          </View>
          <StatCard label="Net savings" value={semesterData ? formatCurrency(semesterData.net) : "—"} accent={C.savings} subtle={C.savingsSubtle} />

          <View style={{ height: 16 }} />
          <SectionLabel text="Daily spending" />
          <SimpleBarChart data={analyticsData?.daily_spending ?? {}} title="Last 7 days" />

          <View style={{ height: 6 }} />
          <SectionLabel text="Top category this week" />
          <InfoCard
            label={topCategory ? topCategory.category : "Top category"}
            value={topCategory ? formatCurrency(topCategory.amount) : "No data for this week"}
            accent={topCategory ? categoryColor(topCategory.category) : undefined}
          />

          {(analyticsData?.top_categories_week.length ?? 0) > 1 && (
            <>
              <View style={{ height: 6 }} />
              <SectionLabel text="All categories this week" />
              {analyticsData!.top_categories_week.map((item) => (
                <View key={item.category} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border }}>
                  <CategoryPill category={item.category} />
                  <Text style={{ color: C.expense, fontWeight: "700", fontSize: 14 }}>{formatCurrency(item.amount)}</Text>
                </View>
              ))}
            </>
          )}

          <View style={{ height: 16 }} />
          <SectionLabel text="Export" />
          <InfoCard label="Download your data" value="Use /reports/export/csv or /reports/export/pdf from your backend URL." />
        </>
      )}
    </ScrollView>
  );
}

// ── Profile Screen ────────────────────────────────────────────────────────────

function ProfileScreen({ apiBaseUrl }: { apiBaseUrl: string }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Profile" onRefresh={() => {}} />

      <View style={{ alignItems: "center", paddingVertical: 24 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.surfaceAlt, borderWidth: 2, borderColor: C.accent, alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <Text style={{ color: C.accent, fontSize: 28 }}>○</Text>
        </View>
        <Text style={{ color: C.textPrimary, fontSize: 17, fontWeight: "700" }}>Student</Text>
        <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 2 }}>student@example.com</Text>
      </View>

      <SectionLabel text="Account" />
      <InfoCard label="Monthly income" value="₹18,000" accent={C.income} />
      <InfoCard label="Data policy" value="All data stays on-device and on your local backend." />

      <View style={{ height: 8 }} />
      <SectionLabel text="Developer" />
      <InfoCard label="Backend URL" value={apiBaseUrl} />
      <InfoCard label="App version" value="0.0.1 — StudentExpenseUI" />
    </ScrollView>
  );
}