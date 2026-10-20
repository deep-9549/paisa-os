// Ledger rules — PRD section 9 "Budget impact by transaction type".
// Bank/card balances move by what actually left or entered an account;
// the budget moves by *my share*, on the spend date.

import type { Account, DateStr, Settlement, Transaction } from "../types";
import { istDate } from "./dates";
import { round2, sum } from "./money";

export const isLive = (t: Transaction) => !t.deleted_at && !t.is_draft;

export const txnDate = (t: Transaction): DateStr => istDate(t.occurred_at);

/** What left my own account for this transaction (expense side). */
export function myPaidAmount(t: Transaction): number {
  if (t.payers && t.payers.length) {
    return sum(t.payers.filter((p) => p.friend_id === null).map((p) => p.amount));
  }
  if (t.paid_by_friend_id) return 0;
  return t.amount;
}

/** My share of an expense (what hits my budget). */
export function myShare(t: Transaction): number {
  return t.my_share ?? t.amount;
}

/** Signed effect of a transaction on one account's balance. */
export function accountDelta(t: Transaction, accountId: string): number {
  let d = 0;
  switch (t.type) {
    case "expense":
      if (t.account_id === accountId) d -= myPaidAmount(t);
      break;
    case "income":
    case "refund":
      if (t.account_id === accountId) d += t.amount;
      break;
    case "transfer":
    case "card_payment":
      if (t.account_id === accountId) d -= t.amount;
      if (t.to_account_id === accountId) d += t.amount;
      break;
    case "adjustment":
      if (t.account_id === accountId) d += (t.adjustment_sign ?? 1) * t.amount;
      break;
  }
  return d;
}

export function accountBalance(
  acc: Account,
  txns: Transaction[],
  settlements: Settlement[],
  asOf?: DateStr,
): number {
  let bal = acc.opening_balance;
  for (const t of txns) {
    if (!isLive(t)) continue;
    const d = txnDate(t);
    if (d < acc.opening_date || (asOf && d > asOf)) continue;
    bal += accountDelta(t, acc.id);
  }
  for (const s of settlements) {
    if (s.account_id !== acc.id || s.date < acc.opening_date || (asOf && s.date > asOf)) continue;
    bal += s.direction === "received" ? s.amount : -s.amount;
  }
  return round2(bal);
}

export const isLiquid = (a: Account) => a.type === "savings" || a.type === "cash" || a.type === "wallet";

/**
 * Budget impact of a transaction (positive = consumes budget).
 * Card bill payments, transfers, income and settlements never touch the budget.
 */
export function budgetImpact(t: Transaction): number {
  if (!isLive(t) || t.exclude_from_budget) return 0;
  if (t.type === "expense") return myShare(t);
  if (t.type === "refund") return -t.amount;
  return 0;
}

/** Category a transaction's budget impact lands in (refunds go back to the original's category). */
export function impactCategory(t: Transaction, byId: Map<string, Transaction>): string | null {
  if (t.type === "refund" && t.refund_of) return byId.get(t.refund_of)?.category_id ?? t.category_id;
  return t.category_id;
}

export function spendInRange(txns: Transaction[], start: DateStr, end: DateStr): number {
  return round2(
    txns.reduce((acc, t) => {
      const d = txnDate(t);
      return d >= start && d <= end ? acc + budgetImpact(t) : acc;
    }, 0),
  );
}

export function spendByCategory(
  txns: Transaction[],
  start: DateStr,
  end: DateStr,
): Map<string | null, number> {
  const byId = new Map(txns.map((t) => [t.id, t]));
  const out = new Map<string | null, number>();
  for (const t of txns) {
    const d = txnDate(t);
    if (d < start || d > end) continue;
    const imp = budgetImpact(t);
    if (!imp) continue;
    const c = impactCategory(t, byId);
    out.set(c, round2((out.get(c) ?? 0) + imp));
  }
  return out;
}

/** Duplicate check: same amount + merchant within 10 minutes. */
export function findDuplicate(
  candidate: Pick<Transaction, "amount" | "merchant" | "occurred_at" | "id">,
  txns: Transaction[],
): Transaction | undefined {
  if (!candidate.merchant) return undefined;
  const t0 = new Date(candidate.occurred_at).getTime();
  const m = candidate.merchant.trim().toLowerCase();
  return txns.find(
    (t) =>
      t.id !== candidate.id &&
      !t.deleted_at &&
      t.amount === candidate.amount &&
      (t.merchant ?? "").trim().toLowerCase() === m &&
      Math.abs(new Date(t.occurred_at).getTime() - t0) <= 10 * 60_000,
  );
}

/** Refundable balance remaining on an expense (supports partial refunds). */
export function refundableLeft(orig: Transaction, txns: Transaction[]): number {
  const refunded = sum(txns.filter((t) => isLive(t) && t.type === "refund" && t.refund_of === orig.id).map((t) => t.amount));
  return round2(orig.amount - refunded);
}

/** Income filed under a "Salary" income category counts as salary landing. */
export function isSalaryIncome(t: Pick<Transaction, "type" | "category_id">, categories: { id: string; name: string; kind: string }[]): boolean {
  if (t.type !== "income" || !t.category_id) return false;
  const c = categories.find((x) => x.id === t.category_id);
  return !!c && c.kind === "income" && c.name.trim().toLowerCase() === "salary";
}
