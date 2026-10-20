// Trips: spend against a trip budget, by day and category. A trip's spends
// are the transactions carrying its tag.

import type { Category, DateStr, Transaction, Trip } from "../types";
import { diffDays } from "./dates";
import { isLive, myShare } from "./ledger";
import { round2 } from "./money";

export const activeTrip = (trips: Trip[], today: DateStr) =>
  trips.find((t) => !t.archived && t.start_date <= today && t.end_date >= today) ?? null;

/** Lowercase, no spaces: "Goa 2026" → "goa2026". */
export const tripTag = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "trip";

export interface TripSummary {
  spent: number;
  left: number;
  days: number;
  /** Day number today (1-based), 0 before the trip, days+1 after. */
  dayNo: number;
  perDay: number;
  /** What's left per remaining day (incl. today). */
  perDayLeft: number;
  byCategory: { category: Category | undefined; amount: number }[];
  txns: Transaction[];
}

export function tripSummary(trip: Trip, txns: Transaction[], categories: Category[], today: DateStr): TripSummary {
  const mine = txns.filter((t) => isLive(t) && t.tags.includes(trip.tag) && (t.type === "expense" || t.type === "refund"));
  const amt = (t: Transaction) => (t.type === "refund" ? -t.amount : myShare(t));
  const spent = round2(mine.reduce((a, t) => a + amt(t), 0));
  const days = diffDays(trip.end_date, trip.start_date) + 1;
  const dayNo = today < trip.start_date ? 0 : today > trip.end_date ? days + 1 : diffDays(today, trip.start_date) + 1;
  const parentOf = (id: string | null) => {
    const c = categories.find((x) => x.id === id);
    return c?.parent_id ?? c?.id ?? null;
  };
  const by = new Map<string | null, number>();
  for (const t of mine) by.set(parentOf(t.category_id), (by.get(parentOf(t.category_id)) ?? 0) + amt(t));
  const remaining = dayNo === 0 ? days : Math.max(days - dayNo + 1, 0);
  return {
    spent,
    left: round2(trip.budget - spent),
    days,
    dayNo,
    perDay: round2(spent / Math.max(Math.min(dayNo || 1, days), 1)),
    perDayLeft: remaining > 0 ? round2(Math.max(trip.budget - spent, 0) / remaining) : 0,
    byCategory: [...by].map(([id, amount]) => ({ category: categories.find((c) => c.id === id), amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
    txns: mine.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
  };
}
