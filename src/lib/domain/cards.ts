// Credit card engine — PRD 4.3 and section 9 "Card cycle rules".

import type { Account, CardCycle, CardEmi, CreditCard, DateStr, Settlement, Transaction } from "../types";
import { addDays, addMonths, clampedDate, diffDays, parseDate } from "./dates";
import { accountBalance, isLive, myPaidAmount, txnDate } from "./ledger";
import { round2, sum } from "./money";

export interface CycleRange {
  start: DateStr;
  end: DateStr;
}

/** The billing cycle containing `date`: it ends on the statement day (clamped to month end). */
export function cardCycleFor(date: DateStr, statementDay: number): CycleRange {
  const d = parseDate(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const thisEnd = clampedDate(y, m, statementDay);
  const end = date <= thisEnd ? thisEnd : clampedDate(y, m + 1, statementDay);
  const e = parseDate(end);
  const prevEnd = clampedDate(e.getUTCFullYear(), e.getUTCMonth() - 1, statementDay);
  return { start: addDays(prevEnd, 1), end };
}

/** Due date = statement date + grace days, or the next occurrence of a fixed due day. */
export function dueDateFor(card: Pick<CreditCard, "due_mode" | "due_day" | "grace_days">, statementDate: DateStr): DateStr {
  if (card.due_mode === "after_statement") return addDays(statementDate, card.grace_days || 20);
  const d = parseDate(statementDate);
  const same = clampedDate(d.getUTCFullYear(), d.getUTCMonth(), card.due_day);
  return same > statementDate ? same : clampedDate(d.getUTCFullYear(), d.getUTCMonth() + 1, card.due_day);
}

/** Minimum due = max(pct% of total, ₹200) with EMIs due added in full; never above total. */
export function minimumDue(total: number, pct = 5, emiDue = 0): number {
  if (total <= 0) return 0;
  const base = Math.max(total - emiDue, 0);
  const min = (base > 0 ? Math.max((base * pct) / 100, 200) : 0) + emiDue;
  return round2(Math.min(min, total));
}

export interface EmiInstallment {
  n: number;
  date: DateStr;
  principal: number;
  interest: number;
  gst: number;
  total: number;
}

export function emiSchedule(emi: Pick<CardEmi, "principal" | "tenure_months" | "annual_rate" | "gst_pct" | "start_date">): EmiInstallment[] {
  const P = emi.principal;
  const n = Math.max(1, emi.tenure_months);
  const r = emi.annual_rate / 12 / 100;
  const pay = r === 0 ? P / n : (P * r * (1 + r) ** n) / ((1 + r) ** n - 1);
  const out: EmiInstallment[] = [];
  let bal = P;
  for (let i = 1; i <= n; i++) {
    const interest = round2(bal * r);
    const principal = i === n ? round2(bal) : round2(pay - interest);
    bal = round2(bal - principal);
    const gst = round2((interest * emi.gst_pct) / 100);
    out.push({ n: i, date: addMonths(emi.start_date, i - 1), principal, interest, gst, total: round2(principal + interest + gst) });
  }
  return out;
}

/** Charges that belong on a statement (EMI-converted swipes are replaced by installments). */
function statementCharge(t: Transaction, cardId: string): number {
  if (!isLive(t)) return 0;
  if (t.type === "expense" && t.account_id === cardId) return t.emi_id ? 0 : myPaidAmount(t);
  if (t.type === "refund" && t.account_id === cardId) return -t.amount;
  if (t.type === "transfer" && t.account_id === cardId) return t.amount; // cash withdrawal etc.
  if (t.type === "adjustment" && t.account_id === cardId) return -(t.adjustment_sign ?? 1) * t.amount;
  return 0;
}

const isPaymentTo = (t: Transaction, cardId: string) =>
  isLive(t) && (t.type === "card_payment" || t.type === "transfer") && t.to_account_id === cardId;

export type StatementStatus = "paid" | "partly_paid" | "unpaid" | "overdue";

export interface Statement {
  start: DateStr;
  end: DateStr;
  total: number;
  min_due: number;
  due_date: DateStr;
  paid: number;
  status: StatementStatus;
  emi_due: number;
  /** Stored snapshot differs from recomputed total (back-dated change). */
  adjusted: boolean;
}

export interface CardSummary {
  card: CreditCard;
  account: Account;
  open: CycleRange;
  unbilled: number;
  statements: Statement[]; // oldest first, closed cycles only
  last: Statement | null;
  outstanding: number;
  available: number;
  utilisation: number;
  /** Amount still to pay on statements (billed, unpaid). */
  billedDue: number;
  nextDue: { date: DateStr; amount: number; min: number } | null;
}

export function summariseCard(
  card: CreditCard,
  account: Account,
  txns: Transaction[],
  emis: CardEmi[],
  stored: CardCycle[],
  settlements: Settlement[],
  today: DateStr,
): CardSummary {
  const mine = txns.filter((t) => t.account_id === card.account_id || t.to_account_id === card.account_id);
  const open = cardCycleFor(today, card.statement_day);

  const firstDate = [account.opening_date, ...mine.map(txnDate)].sort()[0] ?? today;
  const installments = emis
    .filter((e) => e.card_id === card.account_id && e.active)
    .flatMap((e) => emiSchedule(e));

  const statements: Statement[] = [];
  let c = cardCycleFor(firstDate, card.statement_day);
  while (c.end < open.start) {
    const cyc = c;
    const charges = sum(mine.filter((t) => inCycle(t, cyc)).map((t) => statementCharge(t, card.account_id)));
    const emiDue = sum(installments.filter((i) => i.date >= cyc.start && i.date <= cyc.end).map((i) => i.principal));
    const total = round2(charges + emiDue);
    const row = stored.find((s) => s.card_id === card.account_id && s.start_date === cyc.start);
    const min = row?.min_due_override ?? minimumDue(total, card.min_due_pct || 5, emiDue);
    statements.push({
      start: cyc.start,
      end: cyc.end,
      total,
      min_due: min,
      due_date: dueDateFor(card, cyc.end),
      paid: 0,
      status: "unpaid",
      emi_due: emiDue,
      adjusted: !!row && row.total_due !== null && round2(row.total_due) !== total,
    });
    c = cardCycleFor(addDays(c.end, 1), card.statement_day);
  }

  // Payment allocation: oldest unpaid statement first, then the open cycle.
  let pool = sum(mine.filter((t) => isPaymentTo(t, card.account_id)).map((t) => t.amount));
  for (const s of statements) {
    const need = Math.max(s.total, 0);
    s.paid = round2(Math.min(pool, need));
    pool = round2(pool - s.paid);
    s.status = statementStatus(s, today);
  }

  const unbilledCharges = sum(mine.filter((t) => inCycle(t, open)).map((t) => statementCharge(t, card.account_id)));
  const unbilledEmi = sum(installments.filter((i) => i.date >= open.start && i.date <= open.end).map((i) => i.principal));
  const unbilled = round2(Math.max(unbilledCharges + unbilledEmi - pool, 0));

  const outstanding = round2(Math.max(-accountBalance(account, txns, settlements), 0));
  const billedDue = round2(sum(statements.map((s) => Math.max(s.total - s.paid, 0))));
  const last = statements[statements.length - 1] ?? null;
  const pending = statements.filter((s) => s.status !== "paid");
  const nextDue = pending.length
    ? {
        date: pending[0].due_date,
        amount: billedDue,
        min: round2(sum(pending.map((s) => Math.max(s.min_due - s.paid, 0)))),
      }
    : null;

  return {
    card,
    account,
    open,
    unbilled,
    statements,
    last,
    outstanding,
    available: round2(card.credit_limit - outstanding),
    utilisation: card.credit_limit > 0 ? outstanding / card.credit_limit : 0,
    billedDue,
    nextDue,
  };
}

function inCycle(t: Transaction, c: CycleRange): boolean {
  const d = txnDate(t);
  return d >= c.start && d <= c.end;
}

export function statementStatus(s: Pick<Statement, "paid" | "total" | "min_due" | "due_date">, today: DateStr): StatementStatus {
  if (s.paid >= s.total) return "paid";
  if (s.paid >= s.min_due) return "partly_paid";
  return today > s.due_date ? "overdue" : "unpaid";
}

// ---------- Rewards ----------

export function rewardRate(rules: CreditCard["reward_rules"], merchant: string | null): number {
  const m = (merchant ?? "").toLowerCase();
  const specific = rules.find((r) => r.match !== "*" && r.match && m.includes(r.match.toLowerCase()));
  if (specific) return specific.rate;
  return rules.find((r) => r.match === "*")?.rate ?? 0;
}

export function rewardsSummary(card: CreditCard, txns: Transaction[], today: DateStr) {
  const swipes = txns.filter((t) => isLive(t) && t.type === "expense" && t.account_id === card.account_id);
  let earned = 0;
  let expiringSoon = 0;
  let expired = 0;
  const expiry = card.points_expiry_months || 0;
  for (const t of swipes) {
    const pts = (myPaidAmount(t) * rewardRate(card.reward_rules, t.merchant)) / 100;
    earned += pts;
    if (expiry > 0) {
      const exp = addMonths(txnDate(t), expiry);
      if (exp <= today) expired += pts;
      else if (diffDays(exp, today) <= 30) expiringSoon += pts;
    }
  }
  const balance = Math.max(earned - expired - card.points_redeemed, 0);
  return { earned: round2(earned), balance: round2(balance), expiringSoon: round2(expiringSoon), expired: round2(expired) };
}

// ---------- Annual fee waiver ----------

export function feeWaiverProgress(card: CreditCard, txns: Transaction[], today: DateStr) {
  if (!card.fee_waiver_spend || !card.annual_fee) return null;
  const anchor = card.fee_anniversary ?? today;
  // Card year runs from the last anniversary to the next one.
  let start = anchor;
  while (addMonths(start, 12) <= today) start = addMonths(start, 12);
  while (start > today) start = addMonths(start, -12);
  const next = addMonths(start, 12);
  const spent = sum(
    txns
      .filter((t) => isLive(t) && t.type === "expense" && t.account_id === card.account_id && !t.emi_id)
      .filter((t) => txnDate(t) >= start && txnDate(t) < next)
      .map(myPaidAmount),
  );
  const remaining = round2(Math.max(card.fee_waiver_spend - spent, 0));
  return { spent, remaining, target: card.fee_waiver_spend, deadline: addDays(next, -1), fee: card.annual_fee, pct: Math.min(spent / card.fee_waiver_spend, 1) };
}
