// Budget cycle ("budget month") resolution — PRD 4.4.
// A cycle is calendar month, a custom start day (1–31, clamped to month end),
// or "salary": it starts on the day salary actually lands. Settings changes are
// stored with an effective date so past cycles are never rewritten.

import type { CycleSetting, DateStr } from "../types";
import { addDays, clampedDate, diffDays, maxDate, parseDate } from "./dates";

export interface Cycle {
  start: DateStr;
  end: DateStr;
  /** Total days in the cycle. */
  length: number;
}

const MIN_STUB_DAYS = 15;

function naturalCycle(date: DateStr, startDay: number): Cycle {
  const d = parseDate(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const thisMonthStart = clampedDate(y, m, startDay);
  const start = date >= thisMonthStart ? thisMonthStart : clampedDate(y, m - 1, startDay);
  const s = parseDate(start);
  const nextStart = clampedDate(s.getUTCFullYear(), s.getUTCMonth() + 1, startDay);
  const end = addDays(nextStart, -1);
  return { start, end, length: diffDays(end, start) + 1 };
}

function settingAt(history: CycleSetting[], date: DateStr): { cur: CycleSetting; next?: CycleSetting } {
  const sorted = [...history].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  if (sorted.length === 0) return { cur: { effective_from: "1970-01-01", mode: "calendar", start_day: 1 } };
  let idx = 0;
  for (let i = 0; i < sorted.length; i++) if (sorted[i].effective_from <= date) idx = i;
  return { cur: sorted[idx], next: sorted[idx + 1] };
}

const dayFor = (s: CycleSetting) => (s.mode === "calendar" ? 1 : Math.min(Math.max(s.start_day, 1), 31));

/**
 * Resolve the budget cycle containing `date`.
 * @param salaryDates dates on which salary was credited (any order); used in salary mode.
 */
export function getCycle(date: DateStr, history: CycleSetting[], salaryDates: DateStr[] = []): Cycle {
  const { cur, next } = settingAt(history, date);
  const day = dayFor(cur);
  let { start, end } = naturalCycle(date, day);

  if (cur.mode === "salary") {
    ({ start, end } = salaryCycle(date, day, salaryDates, start));
  }

  start = maxDate(start, cur.effective_from);
  if (next) {
    const f = next.effective_from;
    if (end >= f) {
      end = addDays(f, -1);
      // A short stub just before the switch is merged into the previous cycle.
      if (diffDays(f, start) < MIN_STUB_DAYS && start > cur.effective_from) {
        start = maxDate(naturalCycle(addDays(start, -1), day).start, cur.effective_from);
      }
    } else if (diffDays(f, addDays(end, 1)) < MIN_STUB_DAYS) {
      end = addDays(f, -1);
    }
  }
  return { start, end, length: diffDays(end, start) + 1 };
}

function salaryCycle(date: DateStr, day: number, salaryDates: DateStr[], naturalStart: DateStr) {
  const paid = salaryDates.filter((d) => d <= date).sort();
  const last = paid[paid.length - 1];
  let start = naturalStart;
  if (last) {
    const sinceLast = diffDays(date, last);
    // Salary for this cycle landed (early or on time), or a late salary hasn't
    // landed yet and the previous cycle stays open.
    if (last >= addDays(naturalStart, -10) || sinceLast <= 40) start = last;
  }
  // Next cycle begins at the next natural start at least 10 days after this one.
  const nat = naturalCycle(addDays(start, 10), day);
  let end = nat.start > addDays(start, 10) ? addDays(nat.start, -1) : nat.end;
  // When the next salary is already known (past cycles), it ends this one —
  // earlier than usual if it came early, later if it came late.
  const nextPaid = salaryDates.filter((d) => d > addDays(start, 10)).sort()[0];
  if (nextPaid && diffDays(nextPaid, start) <= 45) end = addDays(nextPaid, -1);
  if (end < date) end = date; // late salary keeps the cycle open
  return { start, end };
}

export function daysLeft(cycle: Cycle, today: DateStr): number {
  return Math.max(1, diffDays(cycle.end, today) + 1);
}

export function elapsedFraction(cycle: Cycle, today: DateStr): number {
  const elapsed = diffDays(today, cycle.start) + 1;
  return Math.min(1, Math.max(0, elapsed / cycle.length));
}

export function previousCycle(cycle: Cycle, history: CycleSetting[], salaryDates: DateStr[] = []): Cycle {
  return getCycle(addDays(cycle.start, -1), history, salaryDates);
}

/** Last `n` cycles ending with the one containing `date` (oldest first). */
export function recentCycles(date: DateStr, n: number, history: CycleSetting[], salaryDates: DateStr[] = []): Cycle[] {
  const out: Cycle[] = [];
  let c = getCycle(date, history, salaryDates);
  for (let i = 0; i < n; i++) {
    out.unshift(c);
    c = previousCycle(c, history, salaryDates);
  }
  return out;
}

/**
 * Append a new cycle setting. It takes effect from the next start date under
 * the new setting, so the running cycle and all past cycles are untouched.
 */
export function changeCycleSetting(
  history: CycleSetting[],
  mode: CycleSetting["mode"],
  startDay: number,
  today: DateStr,
): CycleSetting[] {
  const day = mode === "calendar" ? 1 : startDay;
  const effective = addDays(naturalCycle(today, day).end, 1);
  const kept = history.filter((h) => h.effective_from <= today);
  if (kept.length === 0) return [{ effective_from: today, mode, start_day: day }];
  return [...kept, { effective_from: effective, mode, start_day: day }];
}

export function describeSetting(s: CycleSetting): string {
  if (s.mode === "calendar") return "Calendar month";
  const suffix = ordinal(s.start_day);
  return s.mode === "salary" ? `From salary day (≈ ${suffix})` : `${suffix} to ${ordinal(s.start_day === 1 ? 31 : s.start_day - 1)}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
