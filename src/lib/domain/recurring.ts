// Recurring rules: occurrences, expected amounts, and posting status — PRD 4.5.

import type { DateStr, RecurringRule, Transaction } from "../types";
import { addDays, clampedDate, diffDays, monthsBetween, parseDate } from "./dates";
import { isLive, txnDate } from "./ledger";
import { round2 } from "./money";

const PERIOD_DAYS: Record<RecurringRule["frequency"], number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
  custom: 30,
};

export const periodDays = (r: RecurringRule) =>
  r.frequency === "custom" ? Math.max(1, r.interval_days ?? 30) : PERIOD_DAYS[r.frequency];

/** All occurrence dates of a rule within [from, to]. */
export function occurrences(rule: RecurringRule, from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  const lo = from > rule.start_date ? from : rule.start_date;
  const hi = rule.end_date && rule.end_date < to ? rule.end_date : to;
  if (lo > hi) return out;

  if (rule.frequency === "weekly" || rule.frequency === "custom") {
    const step = periodDays(rule);
    const k = Math.max(0, Math.ceil(diffDays(lo, rule.start_date) / step));
    for (let d = addDays(rule.start_date, k * step); d <= hi; d = addDays(d, step)) if (d >= lo) out.push(d);
    return out;
  }

  const stepMonths = rule.frequency === "monthly" ? 1 : rule.frequency === "quarterly" ? 3 : 12;
  const s = parseDate(rule.start_date);
  // First occurrence: the due day in the start month, or the next period if already past.
  let i = clampedDate(s.getUTCFullYear(), s.getUTCMonth(), rule.due_day) >= rule.start_date ? 0 : stepMonths;
  for (let guard = 0; guard < 1000; guard++, i += stepMonths) {
    const d = clampedDate(s.getUTCFullYear(), s.getUTCMonth() + i, rule.due_day);
    if (d > hi) break;
    if (d >= lo) out.push(d);
  }
  return out;
}

export function nextOccurrence(rule: RecurringRule, from: DateStr): DateStr | null {
  return occurrences(rule, from, addDays(from, 400))[0] ?? null;
}

export const isVariable = (r: RecurringRule) => r.amount_min !== null && r.amount_max !== null;

/** Posted transactions belonging to a rule. */
export function postedFor(rule: RecurringRule, txns: Transaction[]): Transaction[] {
  return txns.filter((t) => isLive(t) && t.recurring_rule_id === rule.id);
}

/** Expected amount for an occurrence: escalation for rent, 3-month average for variable bills. */
export function expectedAmount(rule: RecurringRule, date: DateStr, txns: Transaction[]): number {
  if (isVariable(rule)) {
    const recent = postedFor(rule, txns)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .slice(0, 3);
    if (recent.length) return round2(recent.reduce((a, t) => a + t.amount, 0) / recent.length);
    return round2(((rule.amount_min ?? 0) + (rule.amount_max ?? 0)) / 2);
  }
  if (rule.escalation_pct > 0) {
    const years = Math.floor(monthsBetween(rule.start_date, date) / 12);
    if (years > 0) return round2(rule.amount * (1 + rule.escalation_pct / 100) ** years);
  }
  return rule.amount;
}

/** Whether an occurrence already has a posted transaction (within half a period). */
export function isPosted(rule: RecurringRule, occurrence: DateStr, txns: Transaction[]): boolean {
  const half = Math.floor(periodDays(rule) / 2);
  return postedFor(rule, txns).some((t) => Math.abs(diffDays(txnDate(t), occurrence)) <= half);
}

export interface Occurrence {
  rule: RecurringRule;
  date: DateStr;
  amount: number;
  posted: boolean;
}

export function occurrencesInRange(
  rules: RecurringRule[],
  txns: Transaction[],
  from: DateStr,
  to: DateStr,
): Occurrence[] {
  return rules
    .filter((r) => r.active)
    .flatMap((rule) =>
      occurrences(rule, from, to).map((date) => ({
        rule,
        date,
        amount: expectedAmount(rule, date, txns),
        posted: isPosted(rule, date, txns),
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Occurrences due on or before `today` that are not posted yet (job: post_recurring). */
export function dueToPost(rules: RecurringRule[], txns: Transaction[], today: DateStr): Occurrence[] {
  return occurrencesInRange(rules, txns, addDays(today, -45), today).filter((o) => !o.posted);
}

export function yearlyCost(rule: RecurringRule): number {
  const perYear =
    rule.frequency === "monthly" ? 12 : rule.frequency === "quarterly" ? 4 : rule.frequency === "yearly" ? 1 : 365 / periodDays(rule);
  const amt = isVariable(rule) ? ((rule.amount_min ?? 0) + (rule.amount_max ?? 0)) / 2 : rule.amount;
  return round2(amt * perYear);
}
