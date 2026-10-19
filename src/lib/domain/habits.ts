// The daily habit loop: streaks, closed days, no-spend days, the week strip,
// badges and the Sunday review. Everything is derived from transactions and
// day_logs, so nothing can drift out of sync.
//
// A day "counts" towards the streak when it was closed (reviewed) or when
// something was logged by hand on it. Auto-posted recurring rows and IPO
// bookkeeping don't count: the point is the habit, not the ledger.

import type { Category, DateStr, DayLog, Goal, GoalContribution, Transaction } from "../types";
import { addDays, diffDays } from "./dates";
import { budgetImpact, isLive, spendInRange, txnDate } from "./ledger";
import { round2, sum } from "./money";

const isManual = (t: Transaction) =>
  isLive(t) && !t.recurring_rule_id && !t.ipo_application_id && (t.type === "expense" || t.type === "income" || t.type === "refund");

export function trackedDays(txns: Transaction[], logs: DayLog[]): Set<DateStr> {
  const s = new Set<DateStr>(logs.map((l) => l.date));
  for (const t of txns) if (isManual(t)) s.add(txnDate(t));
  return s;
}

export interface Streak {
  current: number;
  best: number;
  /** Today already counts. */
  todayDone: boolean;
  /** A streak is running but today isn't tracked yet. */
  atRisk: boolean;
}

export function streakInfo(days: Set<DateStr>, today: DateStr): Streak {
  const todayDone = days.has(today);
  let current = 0;
  for (let d = todayDone ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) current++;
  let best = 0;
  let run = 0;
  let prev: DateStr | null = null;
  for (const d of [...days].filter((x) => x <= today).sort()) {
    run = prev && diffDays(d, prev) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best: Math.max(best, current), todayDone, atRisk: !todayDone && current > 0 };
}

export const MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
export const nextMilestone = (n: number) => MILESTONES.find((m) => m > n) ?? Math.ceil((n + 1) / 100) * 100;

export interface DayPoint {
  date: DateStr;
  spent: number;
  closed: boolean;
  future: boolean;
}

/** Spend per day across [start, end]; days after today are marked future. */
export function dailySeries(txns: Transaction[], logs: DayLog[], start: DateStr, end: DateStr, today: DateStr): DayPoint[] {
  const by = new Map<DateStr, number>();
  for (const t of txns) {
    const d = txnDate(t);
    if (d < start || d > end) continue;
    const imp = budgetImpact(t);
    if (imp) by.set(d, (by.get(d) ?? 0) + imp);
  }
  const closed = new Set(logs.map((l) => l.date));
  const out: DayPoint[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    out.push({ date: d, spent: round2(by.get(d) ?? 0), closed: closed.has(d), future: d > today });
  }
  return out;
}

/** Monday-start week containing `date`. */
export function weekOf(date: DateStr): { start: DateStr; end: DateStr } {
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sun
  const start = addDays(date, wd === 0 ? -6 : 1 - wd);
  return { start, end: addDays(start, 6) };
}

/** Past days (≤ today) in range with no budget spend at all. */
export function noSpendDays(txns: Transaction[], start: DateStr, end: DateStr, today: DateStr): DateStr[] {
  const last = end < today ? end : addDays(today, -1);
  const out: DateStr[] = [];
  const spentDays = new Set(txns.filter((t) => budgetImpact(t) > 0).map(txnDate));
  for (let d = start; d <= last; d = addDays(d, 1)) if (!spentDays.has(d)) out.push(d);
  return out;
}

export interface WeekReview {
  start: DateStr;
  end: DateStr;
  spent: number;
  prevSpent: number;
  /** Change vs the previous week, as a fraction (−0.2 = 20% less). */
  change: number | null;
  topCategory: { category: Category | undefined; amount: number } | null;
  biggest: Transaction | null;
  noSpend: number;
  daysTracked: number;
  daysUnder: number;
  txnCount: number;
}

export function weekReview(txns: Transaction[], logs: DayLog[], categories: Category[], weekStart: DateStr, today: DateStr): WeekReview {
  const start = weekStart;
  const end = addDays(start, 6);
  const live = txns.filter(isLive);
  const inWeek = live.filter((t) => {
    const d = txnDate(t);
    return d >= start && d <= end && budgetImpact(t) > 0;
  });
  const spent = spendInRange(live, start, end);
  // Mid-week, compare like with like: the same weekdays of last week.
  const upto = end < today ? end : today;
  const prevSpent = spendInRange(live, addDays(start, -7), addDays(upto, -7));
  const byCat = new Map<string, number>();
  const parentOf = (id: string | null) => {
    const c = categories.find((x) => x.id === id);
    return c?.parent_id ?? c?.id ?? "none";
  };
  for (const t of inWeek) byCat.set(parentOf(t.category_id), (byCat.get(parentOf(t.category_id)) ?? 0) + budgetImpact(t));
  const top = [...byCat].sort((a, b) => b[1] - a[1])[0];
  const days = trackedDays(txns, logs);
  let tracked = 0;
  for (let d = start; d <= end && d <= today; d = addDays(d, 1)) if (days.has(d)) tracked++;
  const weekLogs = logs.filter((l) => l.date >= start && l.date <= end);
  return {
    start,
    end,
    spent,
    prevSpent,
    change: prevSpent > 0 ? round2((spent - prevSpent) / prevSpent) : null,
    topCategory: top ? { category: categories.find((c) => c.id === top[0]), amount: round2(top[1]) } : null,
    biggest: inWeek.sort((a, b) => budgetImpact(b) - budgetImpact(a))[0] ?? null,
    noSpend: noSpendDays(live, start, end, today).length,
    daysTracked: tracked,
    daysUnder: weekLogs.filter((l) => l.spent <= l.allowance).length,
    txnCount: inWeek.length,
  };
}

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  body: string;
  earned: boolean;
  /** 0..1 progress towards earning it. */
  progress: number;
}

export function badges(i: {
  txns: Transaction[];
  logs: DayLog[];
  goals: Goal[];
  contributions: GoalContribution[];
  streak: Streak;
  today: DateStr;
}): Badge[] {
  const live = i.txns.filter(isLive);
  const manual = live.filter(isManual).length;
  const best = i.streak.best;
  const closedNoSpend = i.logs.filter((l) => l.spent === 0).length;
  const under = i.logs.filter((l) => l.spent <= l.allowance).length;
  const splits = live.filter((t) => t.my_share !== null).length;
  const saved = (g: Goal) => sum(i.contributions.filter((c) => c.goal_id === g.id).map((c) => c.amount));
  const goalHit = i.goals.some((g) => g.target > 0 && saved(g) >= g.target);
  const goalBest = Math.max(0, ...i.goals.filter((g) => g.target > 0).map((g) => saved(g) / g.target));
  const wk = weekOf(i.today);
  let frugalWeek = 0;
  for (let w = 0; w < 8; w++) {
    const s = addDays(wk.start, -7 * w);
    frugalWeek = Math.max(frugalWeek, noSpendDays(live, s, addDays(s, 6), i.today).length);
  }
  const b = (id: string, emoji: string, title: string, body: string, have: number, need: number): Badge => ({
    id, emoji, title, body, earned: have >= need, progress: Math.min(have / need, 1),
  });
  return [
    b("first", "🌱", "First step", "Log your first spend", manual, 1),
    b("streak3", "🔥", "Warming up", "3-day streak", best, 3),
    b("streak7", "⚡", "Week warrior", "7-day streak", best, 7),
    b("streak30", "🏆", "Habit formed", "30-day streak", best, 30),
    b("streak100", "💎", "Centurion", "100-day streak", best, 100),
    b("nospend", "🧘", "Zen day", "Close a day with zero spend", closedNoSpend, 1),
    b("frugal", "🥷", "Frugal ninja", "3 no-spend days in one week", frugalWeek, 3),
    b("under", "🎯", "On target", "Close 10 days under your daily allowance", under, 10),
    b("split", "🤝", "Fair share", "Split 5 bills with friends", splits, 5),
    b("goal", "🏁", "Goal getter", "Fully fund a savings goal", goalHit ? 1 : goalBest, 1),
    b("logger", "📒", "Bookkeeper", "Log 100 transactions", manual, 100),
  ];
}

/** Friendly one-liner for the close-the-day card. */
export function dayVerdict(spent: number, allowance: number): { tone: "good" | "warn" | "bad"; text: string } {
  if (spent === 0) return { tone: "good", text: "A no-spend day. Nicely done." };
  if (allowance <= 0) return { tone: "bad", text: "You're past this month's budget — every rupee counts now." };
  const r = spent / allowance;
  if (r <= 0.6) return { tone: "good", text: "Well under today's allowance. The rest rolls forward." };
  if (r <= 1) return { tone: "good", text: "Within today's allowance." };
  if (r <= 1.5) return { tone: "warn", text: "A little over today. Tomorrow's allowance adjusts." };
  return { tone: "bad", text: "Big spend day. The coming days get a bit tighter." };
}

export interface FrequentSpend {
  merchant: string;
  amount: number;
  method: Transaction["method"];
  category_id: string | null;
  count: number;
}

/** Most repeated hand-logged spends in the last 60 days, for one-tap "log again". */
export function frequentSpends(txns: Transaction[], today: DateStr, n = 6): FrequentSpend[] {
  const since = addDays(today, -60);
  const by = new Map<string, { last: Transaction; count: number }>();
  for (const t of txns) {
    if (!isManual(t) || t.type !== "expense" || !t.merchant || t.my_share !== null || t.paid_by_friend_id) continue;
    const d = txnDate(t);
    if (d < since || d > today) continue;
    const k = t.merchant.trim().toLowerCase();
    const cur = by.get(k);
    if (!cur) by.set(k, { last: t, count: 1 });
    else {
      cur.count++;
      if (t.occurred_at > cur.last.occurred_at) cur.last = t;
    }
  }
  return [...by.values()]
    .filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count || b.last.occurred_at.localeCompare(a.last.occurred_at))
    .slice(0, n)
    .map(({ last, count }) => ({ merchant: last.merchant!, amount: last.amount, method: last.method, category_id: last.category_id, count }));
}
