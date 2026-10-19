// Category envelopes with pace — PRD 4.4.

import type { BudgetLine, Category, DateStr, Transaction } from "../types";
import { type Cycle, elapsedFraction } from "./cycle";
import { isLive, spendByCategory, txnDate } from "./ledger";
import { round2 } from "./money";

export type PaceStatus = "ok" | "warn" | "over";

export interface EnvelopeView {
  line: BudgetLine;
  category: Category | undefined;
  budget: number; // incl. rollover
  rolledOver: number;
  spent: number;
  pct: number;
  elapsed: number;
  status: PaceStatus;
  overPace: boolean;
  label: string;
}

/** Spend per top-level category (children roll up into their parent). */
export function rollUp(byCat: Map<string | null, number>, categories: Category[]): Map<string | null, number> {
  const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
  const out = new Map<string | null, number>();
  for (const [cat, v] of byCat) {
    out.set(cat, round2((out.get(cat) ?? 0) + v));
    const p = cat ? parentOf.get(cat) : null;
    if (p) out.set(p, round2((out.get(p) ?? 0) + v));
  }
  return out;
}

/**
 * Colour rules: red = over budget, amber = 80%+ used or ahead of pace,
 * green = under pace.
 */
export function paceStatus(spent: number, budget: number, elapsed: number): { status: PaceStatus; overPace: boolean; pct: number } {
  const pct = budget > 0 ? spent / budget : spent > 0 ? Infinity : 0;
  const overPace = pct > elapsed + 0.05;
  const status: PaceStatus = pct > 1 ? "over" : pct >= 0.8 || overPace ? "warn" : "ok";
  return { status, overPace, pct };
}

export function envelopes(
  lines: BudgetLine[],
  categories: Category[],
  txns: Transaction[],
  cycle: Cycle,
  prev: Cycle,
  today: DateStr,
): EnvelopeView[] {
  const cur = rollUp(spendByCategory(txns, cycle.start, cycle.end), categories);
  const old = rollUp(spendByCategory(txns, prev.start, prev.end), categories);
  const elapsed = elapsedFraction(cycle, today);
  return lines.map((line) => {
    const rolledOver = line.rollover ? Math.max(round2(line.amount - (old.get(line.category_id) ?? 0)), 0) : 0;
    const budget = round2(line.amount + rolledOver);
    const spent = cur.get(line.category_id) ?? 0;
    const p = paceStatus(spent, budget, elapsed);
    const label = `spent ${Math.round(p.pct * 100)}% with ${Math.round(elapsed * 100)}% of the month gone${
      p.status === "over" ? " → over budget" : p.overPace ? " → over pace" : ""
    }`;
    return { line, category: categories.find((c) => c.id === line.category_id), budget, rolledOver, spent, elapsed, label, ...p };
  });
}

/** Card spend this cycle vs the optional card cap. */
export function cardSpend(txns: Transaction[], cardIds: Set<string>, cycle: Cycle): number {
  return round2(
    txns
      .filter((t) => isLive(t) && t.type === "expense" && t.account_id && cardIds.has(t.account_id))
      .filter((t) => txnDate(t) >= cycle.start && txnDate(t) <= cycle.end)
      .reduce((a, t) => a + (t.my_share ?? t.amount), 0),
  );
}

/** How a category was paid this cycle (UPI / card / cash …). */
export function methodSplit(txns: Transaction[], cycle: Cycle, categoryIds?: Set<string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txns) {
    if (!isLive(t) || t.type !== "expense" || t.exclude_from_budget) continue;
    const d = txnDate(t);
    if (d < cycle.start || d > cycle.end) continue;
    if (categoryIds && (!t.category_id || !categoryIds.has(t.category_id))) continue;
    const key = t.paid_by_friend_id ? "friend" : t.method;
    out[key] = round2((out[key] ?? 0) + (t.my_share ?? t.amount));
  }
  return out;
}

/** Suggested envelopes from salary using typical Indian salaried splits. */
export const SUGGESTED_SPLIT: { path: string; pct: number }[] = [
  { path: "Food", pct: 12 },
  { path: "Transport", pct: 5 },
  { path: "Shopping", pct: 8 },
  { path: "Entertainment", pct: 4 },
  { path: "Bills & Utilities", pct: 5 },
  { path: "Health", pct: 3 },
  { path: "Personal care", pct: 2 },
];
