// Insights and reports — PRD 4.9.

import type { Account, Category, DateStr, Holding, Settlement, Transaction, TransactionSplit } from "../types";
import { rollUp } from "./budgets";
import type { Cycle } from "./cycle";
import { addDays, diffDays, istParts } from "./dates";
import { friendBalances } from "./friends";
import { accountBalance, budgetImpact, isLive, spendByCategory, spendInRange, txnDate } from "./ledger";
import { round2, sum } from "./money";

export interface MonthlyReport {
  cycle: Cycle;
  income: number;
  spend: number;
  savings: number;
  savingsRate: number | null;
  topCategories: { id: string | null; name: string; icon: string; amount: number; change: number | null }[];
  topMerchants: { name: string; amount: number; count: number }[];
  methods: { method: string; amount: number }[];
  prevSpend: number;
  momChange: number | null;
}

export function monthlyReport(
  txns: Transaction[],
  categories: Category[],
  cycle: Cycle,
  prev: Cycle,
): MonthlyReport {
  const live = txns.filter(isLive);
  const inC = live.filter((t) => txnDate(t) >= cycle.start && txnDate(t) <= cycle.end);
  const income = sum(inC.filter((t) => t.type === "income" && !t.exclude_from_budget).map((t) => t.amount));
  const spend = spendInRange(live, cycle.start, cycle.end);
  const prevSpend = spendInRange(live, prev.start, prev.end);

  const top = rollUp(spendByCategory(live, cycle.start, cycle.end), categories);
  const prevTop = rollUp(spendByCategory(live, prev.start, prev.end), categories);
  const parents = new Set(categories.filter((c) => !c.parent_id).map((c) => c.id));
  const topCategories = [...top]
    .filter(([id]) => id === null || parents.has(id))
    .map(([id, amount]) => {
      const c = categories.find((x) => x.id === id);
      const p = prevTop.get(id) ?? 0;
      return { id, name: c?.name ?? "Uncategorised", icon: c?.icon ?? "❔", amount, change: p > 0 ? (amount - p) / p : null };
    })
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const merchants = new Map<string, { amount: number; count: number }>();
  for (const t of inC) {
    const imp = budgetImpact(t);
    if (!imp || !t.merchant) continue;
    const k = t.merchant;
    const m = merchants.get(k) ?? { amount: 0, count: 0 };
    m.amount = round2(m.amount + imp);
    m.count++;
    merchants.set(k, m);
  }
  const topMerchants = [...merchants].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount).slice(0, 8);

  const methods = new Map<string, number>();
  for (const t of inC) {
    if (t.type !== "expense" || t.exclude_from_budget) continue;
    const k = t.paid_by_friend_id ? "friend paid" : t.method;
    methods.set(k, round2((methods.get(k) ?? 0) + budgetImpact(t)));
  }

  const savings = round2(income - spend);
  return {
    cycle,
    income,
    spend,
    savings,
    savingsRate: income > 0 ? savings / income : null,
    topCategories,
    topMerchants,
    methods: [...methods].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
    prevSpend,
    momChange: prevSpend > 0 ? (spend - prevSpend) / prevSpend : null,
  };
}

/**
 * Month-end forecast = spent so far + run-rate × days left + scheduled commitments.
 * Run-rate excludes one-off large spends (> 3× median) so a laptop doesn't skew it.
 */
export function forecastMonthEnd(txns: Transaction[], cycle: Cycle, today: DateStr, scheduled: number) {
  const live = txns.filter(isLive);
  const spent = spendInRange(live, cycle.start, today);
  const elapsed = Math.max(1, diffDays(today, cycle.start) + 1);
  const left = Math.max(0, diffDays(cycle.end, today));
  const amounts = live
    .filter((t) => t.type === "expense" && txnDate(t) >= cycle.start && txnDate(t) <= today)
    .map(budgetImpact)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
  const routine = sum(amounts.filter((a) => a <= Math.max(median * 3, 2000)));
  const rate = routine / elapsed;
  return { spent, runRate: round2(rate), projected: round2(spent + rate * left + scheduled) };
}

export interface Anomaly {
  id: string;
  kind: "category" | "large" | "subscription";
  title: string;
  body: string;
}

export function anomalies(
  txns: Transaction[],
  categories: Category[],
  cycles: Cycle[], // oldest first; last = current
  today: DateStr,
): Anomaly[] {
  const out: Anomaly[] = [];
  const live = txns.filter(isLive);
  const cur = cycles[cycles.length - 1];
  const first = live.map(txnDate).sort()[0];
  // Only full cycles after tracking began, so a new user's empty months don't skew averages.
  const past = cycles.slice(-4, -1).filter((c) => first && c.start >= first);

  // Category ≥ 40% above its 3-month average.
  if (past.length) {
    const now = rollUp(spendByCategory(live, cur.start, cur.end), categories);
    const avg = new Map<string | null, number>();
    for (const c of past) for (const [k, v] of rollUp(spendByCategory(live, c.start, c.end), categories)) avg.set(k, (avg.get(k) ?? 0) + v / past.length);
    for (const [k, v] of now) {
      const a = avg.get(k) ?? 0;
      const cat = categories.find((c) => c.id === k);
      if (!cat || cat.parent_id) continue;
      if (a >= 500 && v > a * 1.4)
        out.push({ id: `anom-cat-${k}-${cur.start}`, kind: "category", title: `${cat.icon} ${cat.name} is ${Math.round((v / a - 1) * 100)}% above usual`, body: `₹${Math.round(v)} this month vs ₹${Math.round(a)} 3-month average.` });
    }
  }

  // Unusually large transaction (last 7 days) vs the last 90 days.
  const window = live.filter((t) => t.type === "expense" && txnDate(t) >= addDays(today, -90));
  const vals = window.map((t) => t.my_share ?? t.amount);
  if (vals.length >= 10) {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    for (const t of window.filter((x) => txnDate(x) >= addDays(today, -7))) {
      const v = t.my_share ?? t.amount;
      if (v > mean + 3 * sd && v >= 1000)
        out.push({ id: `anom-large-${t.id}`, kind: "large", title: `Large spend: ₹${Math.round(v)} at ${t.merchant ?? "unknown"}`, body: `That's ${(v / mean).toFixed(1)}× your typical transaction.` });
    }
  }

  // New subscription: a merchant in Subscriptions first seen this cycle.
  const subs = categories.find((c) => c.name === "Subscriptions");
  if (subs) {
    const seenBefore = new Set(live.filter((t) => t.category_id === subs.id && txnDate(t) < cur.start).map((t) => (t.merchant ?? "").toLowerCase()));
    for (const t of live.filter((x) => x.category_id === subs.id && txnDate(x) >= cur.start)) {
      const m = (t.merchant ?? "").toLowerCase();
      if (m && !seenBefore.has(m)) {
        out.push({ id: `anom-sub-${m}`, kind: "subscription", title: `New subscription: ${t.merchant}`, body: "Add it as a recurring bill so it's reserved every month." });
        seenBefore.add(m);
      }
    }
  }
  return out;
}

/** Spend by weekday (rows) × hour (cols), IST. */
export function heatmap(txns: Transaction[], from: DateStr, to: DateStr): number[][] {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const t of txns) {
    if (!isLive(t) || t.type !== "expense") continue;
    const d = txnDate(t);
    if (d < from || d > to) continue;
    const { hour, weekday } = istParts(t.occurred_at);
    grid[weekday][hour] += budgetImpact(t);
  }
  return grid;
}

export function weekendVsWeekday(txns: Transaction[], from: DateStr, to: DateStr) {
  let we = 0, wd = 0;
  const days = { we: new Set<string>(), wd: new Set<string>() };
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wk = new Date(`${d}T00:00:00Z`).getUTCDay();
    (wk === 0 || wk === 6 ? days.we : days.wd).add(d);
  }
  for (const t of txns) {
    if (!isLive(t)) continue;
    const d = txnDate(t);
    if (d < from || d > to) continue;
    if (days.we.has(d)) we += budgetImpact(t);
    else wd += budgetImpact(t);
  }
  return {
    weekendPerDay: days.we.size ? round2(we / days.we.size) : 0,
    weekdayPerDay: days.wd.size ? round2(wd / days.wd.size) : 0,
  };
}

/** Net worth = accounts + investments + friend receivables − card dues − loans. */
export function netWorth(
  accounts: Account[],
  txns: Transaction[],
  settlements: Settlement[],
  holdings: Holding[],
  splits: TransactionSplit[],
  asOf?: DateStr,
): { total: number; liquid: number; investments: number; receivables: number; payables: number; cards: number; loans: number } {
  let liquid = 0, cards = 0, loans = 0;
  for (const a of accounts) {
    if (!a.include_in_net_worth || a.type === "demat") continue;
    const b = accountBalance(a, txns, settlements, asOf);
    if (a.type === "credit_card") cards += Math.max(-b, 0);
    else if (a.type === "loan") loans += Math.max(-b, 0);
    else liquid += b;
  }
  const excluded = new Set(accounts.filter((a) => !a.include_in_net_worth).map((a) => a.id));
  const investments = sum(holdings.filter((h) => !h.account_id || !excluded.has(h.account_id)).map((h) => h.quantity * h.current_price));
  let receivables = 0, payables = 0;
  for (const v of friendBalances(txns, splits, settlements).values()) {
    if (v > 0) receivables += v;
    else payables += -v;
  }
  return {
    total: round2(liquid + investments + receivables - payables - cards - loans),
    liquid: round2(liquid),
    investments: round2(investments),
    receivables: round2(receivables),
    payables: round2(payables),
    cards: round2(cards),
    loans: round2(loans),
  };
}

export function yearlyWrapped(
  txns: Transaction[],
  categories: Category[],
  year: number,
  ipoPnl: number,
) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const live = txns.filter((t) => isLive(t) && txnDate(t) >= from && txnDate(t) <= to);
  const merchants = new Map<string, number>();
  const months = new Map<string, number>();
  let friends = 0;
  let count = 0;
  for (const t of live) {
    const imp = budgetImpact(t);
    if (!imp) continue;
    if (imp > 0) count++;
    if (t.merchant) merchants.set(t.merchant, (merchants.get(t.merchant) ?? 0) + imp);
    const mk = txnDate(t).slice(0, 7);
    months.set(mk, (months.get(mk) ?? 0) + imp);
    if (t.my_share !== null || t.paid_by_friend_id) friends += t.amount;
  }
  const topMerchant = [...merchants].sort((a, b) => b[1] - a[1])[0] ?? null;
  const biggestMonth = [...months].sort((a, b) => b[1] - a[1])[0] ?? null;
  const cat = rollUp(spendByCategory(live, from, to), categories);
  const topCatId = [...cat].filter(([k]) => categories.find((c) => c.id === k && !c.parent_id)).sort((a, b) => b[1] - a[1])[0];
  return {
    year,
    totalSpent: round2(sum([...months.values()])),
    transactions: count,
    topMerchant: topMerchant ? { name: topMerchant[0], amount: round2(topMerchant[1]) } : null,
    biggestMonth: biggestMonth ? { month: biggestMonth[0], amount: round2(biggestMonth[1]) } : null,
    topCategory: topCatId ? { name: categories.find((c) => c.id === topCatId[0])?.name ?? "", amount: round2(topCatId[1]) } : null,
    ipoPnl: round2(ipoPnl),
    withFriends: round2(friends),
  };
}
