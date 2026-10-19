"use client";

import { useEffect, useMemo, useState } from "react";
import { type CardSummary, summariseCard } from "../domain/cards";
import { type Cycle, getCycle, previousCycle, recentCycles } from "../domain/cycle";
import { addDays, istDate } from "../domain/dates";
import { friendBalances } from "../domain/friends";
import { cashEvents, cashForecast } from "../domain/cashflow";
import { envelopes, typicalSpend } from "../domain/budgets";
import { frequentSpends, streakInfo, trackedDays } from "../domain/habits";
import { healthScore } from "../domain/health";
import { forecastMonthEnd, netWorth } from "../domain/insights";
import { occurrencesInRange } from "../domain/recurring";
import { accountBalance, isLive, spendInRange, txnDate } from "../domain/ledger";
import { computeSafeToSpend, type SafeToSpend } from "../domain/safeToSpend";
import type { Account, Tables } from "../types";
import { getProfile } from "./actions";
import { useStore } from "./store";

export const useData = () => useStore((s) => s.data);
export const useProfile = () => getProfile(useData());

/** IST "today", refreshed every minute so the day rolls over at midnight. */
export function useToday(): string {
  const [today, setToday] = useState(() => istDate());
  useEffect(() => {
    const t = setInterval(() => setToday(istDate()), 60_000);
    return () => clearInterval(t);
  }, []);
  return today;
}

export const salaryDates = (d: Tables) =>
  d.transactions.filter((t) => isLive(t) && t.type === "income" && t.is_salary).map(txnDate);

export function cycleFor(d: Tables, date: string): Cycle {
  return getCycle(date, getProfile(d).cycle_history, salaryDates(d));
}

export function useCycle(date?: string): Cycle {
  const d = useData();
  const today = useToday();
  return useMemo(() => cycleFor(d, date ?? today), [d, date, today]);
}

export function usePrevCycle(c: Cycle): Cycle {
  const d = useData();
  return useMemo(() => previousCycle(c, getProfile(d).cycle_history, salaryDates(d)), [d, c]);
}

export function safeToSpendFor(d: Tables, today: string): SafeToSpend {
  return computeSafeToSpend({
    profile: getProfile(d),
    cycle: cycleFor(d, today),
    today,
    accounts: d.accounts,
    transactions: d.transactions,
    settlements: d.settlements,
    rules: d.recurring_rules,
    goals: d.goals,
    contributions: d.goal_contributions,
    holds: d.holds,
  });
}

export function useSafeToSpend(): SafeToSpend {
  const d = useData();
  const today = useToday();
  return useMemo(() => safeToSpendFor(d, today), [d, today]);
}

export function cardSummaries(d: Tables, today: string): CardSummary[] {
  return d.credit_cards
    .map((c) => {
      const acc = d.accounts.find((a) => a.id === c.account_id);
      return acc && !acc.archived ? summariseCard(c, acc, d.transactions, d.card_emis, d.card_cycles, d.settlements, today) : null;
    })
    .filter((x): x is CardSummary => !!x);
}

export function useCardSummaries(): CardSummary[] {
  const d = useData();
  const today = useToday();
  return useMemo(() => cardSummaries(d, today), [d, today]);
}

export function useBalances(): Map<string, number> {
  const d = useData();
  return useMemo(() => new Map(d.accounts.map((a) => [a.id, accountBalance(a, d.transactions, d.settlements)])), [d]);
}

export function useFriendBalances(): Map<string, number> {
  const d = useData();
  return useMemo(() => friendBalances(d.transactions, d.transaction_splits, d.settlements), [d]);
}

export function useNetWorth() {
  const d = useData();
  return useMemo(() => netWorth(d.accounts, d.transactions, d.settlements, d.holdings, d.transaction_splits), [d]);
}

export function useLookups() {
  const d = useData();
  return useMemo(() => {
    const acc = new Map<string, Account>(d.accounts.map((a) => [a.id, a]));
    const cat = new Map(d.categories.map((c) => [c.id, c]));
    const friend = new Map(d.friends.map((f) => [f.id, f]));
    return { acc, cat, friend };
  }, [d]);
}

export const liveTxns = (d: Tables) => d.transactions.filter(isLive);

export function useStreak() {
  const d = useData();
  const today = useToday();
  return useMemo(() => streakInfo(trackedDays(d.transactions, d.day_logs), today), [d.transactions, d.day_logs, today]);
}

export function useFrequent(n = 6) {
  const d = useData();
  const today = useToday();
  return useMemo(() => frequentSpends(d.transactions, today, n), [d.transactions, today, n]);
}

/**
 * Bank balance over the next `days` days. Everyday spending uses the routine
 * run-rate, counting only the share you pay from the bank (card swipes reach
 * the bank later as the card bill, which is already an event).
 */
export function cashForecastFor(d: Tables, today: string, days = 35) {
  const sts = safeToSpendFor(d, today);
  const cards = cardSummaries(d, today);
  const until = addDays(today, days);
  const cardIds = new Set(d.credit_cards.map((c) => c.account_id));
  const liquidIds = new Set(d.accounts.filter((a) => a.type === "savings" || a.type === "cash" || a.type === "wallet").map((a) => a.id));
  const occ = occurrencesInRange(d.recurring_rules, d.transactions, today, until);
  const events = cashEvents(occ, cards, today, until, liquidIds, cardIds);
  const recent = liveTxns(d).filter((t) => t.type === "expense" && !t.recurring_rule_id && istDate(t.occurred_at) >= addDays(today, -30));
  const total = recent.reduce((a, t) => a + (t.my_share ?? t.amount), 0);
  const viaBank = recent.filter((t) => !(t.account_id && cardIds.has(t.account_id)) && !t.paid_by_friend_id).reduce((a, t) => a + (t.my_share ?? t.amount), 0);
  const bankShare = total > 0 ? viaBank / total : 1;
  const runRate = forecastMonthEnd(d.transactions, cycleFor(d, today), today, 0).runRate;
  const dailySpend = Math.round(runRate * bankShare);
  const start = sts.liquid - sts.holds;
  return { ...cashForecast(start, today, days, events, dailySpend), dailySpend, start };
}

export function useCashForecast(days = 35) {
  const d = useData();
  const today = useToday();
  return useMemo(() => cashForecastFor(d, today, days), [d, today, days]);
}

/** Inputs for the money health score, from the last full month and today's balances. */
export function healthFor(d: Tables, today: string) {
  const p = getProfile(d);
  const sal = salaryDates(d);
  const cur = getCycle(today, p.cycle_history, sal);
  const prev = previousCycle(cur, p.cycle_history, sal);
  const live = liveTxns(d);
  const income = live.filter((t) => t.type === "income" && !t.exclude_from_budget && txnDate(t) >= prev.start && txnDate(t) <= prev.end).reduce((a, t) => a + t.amount, 0);
  const spent = spendInRange(live, prev.start, prev.end);
  const past = recentCycles(today, 4, p.cycle_history, sal).slice(0, 3);
  const typical = [...typicalSpend(d.transactions, d.categories, past).entries()]
    .filter(([k]) => !k || !d.categories.find((c) => c.id === k)?.parent_id)
    .reduce((a, [, v]) => a + v, 0);
  const sts = safeToSpendFor(d, today);
  const cards = cardSummaries(d, today);
  const prevPrev = previousCycle(prev, p.cycle_history, sal);
  const env = envelopes(d.budget_lines, d.categories, d.transactions, prev, prevPrev, prev.end);
  const days = trackedDays(d.transactions, d.day_logs);
  let tracked = 0;
  for (let i = 0; i < 14; i++) if (days.has(addDays(today, -i))) tracked++;
  return healthScore({
    savingsRate: income > 0 ? (income - spent) / income : null,
    emergencyMonths: typical > 0 ? Math.max(sts.liquid - sts.holds, 0) / typical : null,
    utilisation: cards.length ? Math.max(...cards.map((c) => c.utilisation)) : null,
    budgetsKept: env.length ? env.filter((e) => e.spent <= e.budget).length / env.length : null,
    billsOnTime: cards.length ? !cards.some((c) => c.statements.some((st) => st.status === "overdue")) : null,
    trackedDays: tracked,
  });
}

export function useHealth() {
  const d = useData();
  const today = useToday();
  return useMemo(() => healthFor(d, today), [d, today]);
}
