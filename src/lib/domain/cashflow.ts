// Cash-flow forecast: where your bank balance is heading over the next few
// weeks, and its lowest point. Safe-to-Spend answers "how much can I spend";
// this answers "will the money be there when the rent and the card bill hit".
//
//   balance(day) = balance today
//                + scheduled income − scheduled bills/SIPs paid from the bank
//                − card bills on their due dates (billed now, unbilled later)
//                − everyday spending paid from the bank (routine run-rate)

import type { DateStr } from "../types";
import type { CardSummary } from "./cards";
import { dueDateFor } from "./cards";
import { addDays } from "./dates";
import { round2 } from "./money";
import type { Occurrence } from "./recurring";

export interface CashEvent {
  date: DateStr;
  label: string;
  amount: number; // + in, − out
  kind: "income" | "bill" | "card" | "invest";
}

export interface CashPoint {
  date: DateStr;
  balance: number;
}

export interface CashForecast {
  points: CashPoint[];
  events: CashEvent[];
  low: CashPoint;
  end: number;
  /** First day the balance goes below zero, if it does. */
  shortfall: CashPoint | null;
}

/**
 * Bank-side events in [today, until]. Rules paid from a credit card are left
 * out (they arrive later as part of the card bill); transfers between your own
 * bank/cash accounts net to zero.
 */
export function cashEvents(
  occ: Occurrence[],
  cards: CardSummary[],
  today: DateStr,
  until: DateStr,
  liquidIds: Set<string>,
  cardIds: Set<string>,
): CashEvent[] {
  const out: CashEvent[] = [];
  for (const o of occ) {
    if (o.posted || o.date < today || o.date > until) continue;
    const r = o.rule;
    if (r.account_id && cardIds.has(r.account_id)) continue;
    if (r.txn_type === "income") {
      out.push({ date: o.date, label: r.name, amount: o.amount, kind: "income" });
    } else if (r.txn_type === "transfer") {
      const fromLiquid = !r.account_id || liquidIds.has(r.account_id);
      const toLiquid = !!r.to_account_id && liquidIds.has(r.to_account_id);
      if (fromLiquid && !toLiquid) out.push({ date: o.date, label: r.name, amount: -o.amount, kind: "invest" });
    } else {
      out.push({ date: o.date, label: r.name, amount: -o.amount, kind: "bill" });
    }
  }
  for (const c of cards) {
    if (c.nextDue && c.nextDue.amount > 0) {
      const date = c.nextDue.date < today ? today : c.nextDue.date;
      if (date <= until) out.push({ date, label: `${c.account.name} bill`, amount: -c.nextDue.amount, kind: "card" });
    }
    if (c.unbilled > 0) {
      const due = dueDateFor(c.card, c.open.end);
      if (due >= today && due <= until) out.push({ date: due, label: `${c.account.name} (current cycle)`, amount: -c.unbilled, kind: "card" });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

export function cashForecast(start: number, today: DateStr, days: number, events: CashEvent[], dailySpend: number): CashForecast {
  const until = addDays(today, days);
  const byDay = new Map<DateStr, number>();
  for (const e of events) if (e.date >= today && e.date <= until) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.amount);
  const points: CashPoint[] = [];
  let bal = start;
  for (let i = 0, d = today; i <= days; i++, d = addDays(d, 1)) {
    if (i > 0) bal -= dailySpend;
    bal += byDay.get(d) ?? 0;
    points.push({ date: d, balance: round2(bal) });
  }
  const low = points.reduce((m, p) => (p.balance < m.balance ? p : m), points[0]);
  return {
    points,
    events: events.filter((e) => e.date >= today && e.date <= until),
    low,
    end: points[points.length - 1].balance,
    shortfall: points.find((p) => p.balance < 0) ?? null,
  };
}
