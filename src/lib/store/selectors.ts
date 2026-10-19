"use client";

import { useEffect, useMemo, useState } from "react";
import { type CardSummary, summariseCard } from "../domain/cards";
import { type Cycle, getCycle, previousCycle } from "../domain/cycle";
import { istDate } from "../domain/dates";
import { friendBalances } from "../domain/friends";
import { frequentSpends, streakInfo, trackedDays } from "../domain/habits";
import { netWorth } from "../domain/insights";
import { accountBalance, isLive, txnDate } from "../domain/ledger";
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
