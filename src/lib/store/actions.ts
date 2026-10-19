"use client";

// Domain actions: every money-moving operation is one atomic commit of rows.

import { SEED_CATEGORIES } from "../domain/categories";
import { emiSchedule } from "../domain/cards";
import { changeCycleSetting } from "../domain/cycle";
import { addDays, dateToTs, istDate } from "../domain/dates";
import { computeSplit, type Participant } from "../domain/friends";
import { roundUp } from "../domain/goals";
import { appliedShares, blockedAmount, issuePrice, realisedPnl, releaseOnAllotment } from "../domain/ipo";
import { merchantKey } from "../domain/parser";
import { round2 } from "../domain/money";
import type {
  Account, CardEmi, Category, CreditCard, Friend, Goal, Hold, ID, IpoApplication, PayMethod, Profile,
  RecurringRule, SplitMode, Tables, Transaction, TransactionSplit,
} from "../types";
import { type Change, getData, nowIso, uid, useStore } from "./store";

const commit = (c: Change[]) => useStore.getState().commit(c);
const up = <T extends object>(table: Change["table"], row: T): Change => ({ table, op: "upsert", row: row as Record<string, unknown> });
const del = (table: Change["table"], key: string): Change => ({ table, op: "delete", key });
const toast = (text: string, action?: { label: string; run: () => void }) => useStore.getState().toast({ text, action });

// ---------------- profile ----------------

export const PROFILE_ID = "00000000-0000-4000-8000-000000000001";

export function defaultProfile(): Profile {
  return {
    id: PROFILE_ID, name: "Deep", salary: 0,
    cycle_history: [{ effective_from: "2000-01-01", mode: "calendar", start_day: 1 }],
    buffer_pct: 5, stcg_rate: 20, ltcg_rate: 12.5, card_cap: null, default_account_id: null, my_upi_id: null,
    pin_hash: null, webauthn_credential_id: null, lock_minutes: 5, theme: "system", privacy_mode: false, onboarded: false,
    notify_daily_nudge: true, notify_weekly: true, friend_reminder_days: 14, family_pans: [], email_digest: false,
    created_at: nowIso(),
  };
}

export const getProfile = (d: Tables = getData()): Profile => d.profiles[0] ?? defaultProfile();

export function updateProfile(patch: Partial<Profile>) {
  commit([up("profiles", { ...getProfile(), ...patch })]);
}

export function setCycleSetting(mode: "calendar" | "custom" | "salary", day: number) {
  const p = getProfile();
  updateProfile({ cycle_history: changeCycleSetting(p.cycle_history, mode, day, istDate()) });
}

// ---------------- categories ----------------

export function seedCategoryRows(): Category[] {
  const rows: Category[] = [];
  for (const c of SEED_CATEGORIES) {
    const pid = uid();
    rows.push({ id: pid, name: c.name, parent_id: null, icon: c.icon, color: c.color, kind: c.kind });
    for (const ch of c.children) rows.push({ id: uid(), name: ch.name, parent_id: pid, icon: ch.icon, color: c.color, kind: c.kind });
  }
  return rows;
}

export function categoryByPath(path: string | null, cats: Category[] = getData().categories): Category | undefined {
  if (!path) return undefined;
  const [parent, child] = path.split("›").map((s) => s.trim());
  const p = cats.find((c) => !c.parent_id && c.name.toLowerCase() === parent.toLowerCase());
  if (!p) return undefined;
  if (!child) return p;
  return cats.find((c) => c.parent_id === p.id && c.name.toLowerCase() === child.toLowerCase()) ?? p;
}

export function categoryPath(id: string | null, cats: Category[] = getData().categories): string {
  const c = cats.find((x) => x.id === id);
  if (!c) return "Uncategorised";
  const p = c.parent_id ? cats.find((x) => x.id === c.parent_id) : null;
  return p ? `${p.name} › ${c.name}` : c.name;
}

export function saveCategory(c: Partial<Category> & { name: string }) {
  commit([up("categories", { id: c.id ?? uid(), parent_id: null, icon: "🏷️", color: "#94a3b8", kind: "expense", ...c })]);
}

export function deleteCategory(id: string) {
  const d = getData();
  const kids = d.categories.filter((c) => c.parent_id === id).map((c) => del("categories", c.id));
  const touched = d.transactions.filter((t) => t.category_id === id).map((t) => up("transactions", { ...t, category_id: null }));
  commit([...touched, ...kids, del("categories", id)]);
}

// ---------------- accounts ----------------

export function newAccount(p: Partial<Account> & { name: string; type: Account["type"] }): Account {
  return {
    id: uid(), opening_balance: 0, opening_date: istDate(), include_in_net_worth: true, archived: false,
    color: "#6366f1", icon: iconFor(p.type), is_default: false, created_at: nowIso(), ...p,
  };
}

export const iconFor = (t: Account["type"]) =>
  ({ savings: "🏦", cash: "💵", wallet: "👛", credit_card: "💳", demat: "📈", loan: "🏧" })[t];

export function saveAccount(a: Account, card?: CreditCard) {
  const c: Change[] = [up("accounts", a)];
  if (card) c.push(up("credit_cards", { ...card, account_id: a.id }));
  commit(c);
}

export function saveUpiHandle(accountId: string, handle: string, id?: string) {
  commit([up("upi_handles", { id: id ?? uid(), account_id: accountId, handle })]);
}

export function deleteUpiHandle(id: string) {
  commit([del("upi_handles", id)]);
}

/** Monthly reconciliation: enter the actual balance; app posts the gap as an adjustment. */
export function reconcileAccount(accountId: string, gap: number, isCard: boolean) {
  if (Math.abs(gap) < 0.01) return;
  // For cards the ledger balance is −outstanding, so the sign flips.
  const sign = (isCard ? -gap : gap) > 0 ? 1 : -1;
  commit([up("transactions", baseTxn({ type: "adjustment", amount: Math.abs(gap), account_id: accountId, method: "other", adjustment_sign: sign, note: "Balance reconciliation", exclude_from_budget: true }))]);
  toast("Reconciliation adjustment added");
}

// ---------------- transactions ----------------

export function baseTxn(p: Partial<Transaction>): Transaction {
  const now = nowIso();
  return {
    id: uid(), type: "expense", amount: 0, occurred_at: now, account_id: null, to_account_id: null, method: "upi",
    category_id: null, merchant: null, note: null, tags: [], my_share: null, paid_by_friend_id: null, payers: null,
    group_id: null, split_mode: null, recurring_rule_id: null, refund_of: null, emi_id: null, ipo_application_id: null,
    goal_id: null, adjustment_sign: null, is_salary: false, is_draft: false, exclude_from_budget: false, receipt_path: null,
    location: null, deleted_at: null, created_at: now, updated_at: now, ...p,
  };
}

export function defaultAccountFor(method: PayMethod, d: Tables = getData()): Account | undefined {
  const live = d.accounts.filter((a) => !a.archived);
  if (method === "card") return live.find((a) => a.type === "credit_card");
  if (method === "cash") return live.find((a) => a.type === "cash") ?? live.find((a) => a.is_default);
  const p = getProfile(d);
  return live.find((a) => a.id === p.default_account_id) ?? live.find((a) => a.is_default) ?? live.find((a) => a.type === "savings");
}

/** Category/method/account from rules engine, then merchant memory. */
export function autoFill(merchant: string | null, d: Tables = getData()) {
  if (!merchant) return null;
  const m = merchant.toLowerCase();
  const rule = d.rules.find((r) => r.match && m.includes(r.match.toLowerCase()));
  const mem = d.merchant_memory.find((x) => x.id === merchantKey(merchant));
  if (!rule && !mem) return null;
  return {
    category_id: rule?.category_id ?? mem?.category_id ?? null,
    method: rule?.method ?? mem?.method ?? null,
    account_id: rule?.account_id ?? mem?.account_id ?? null,
    fromRule: !!rule,
  };
}

export interface SplitInput {
  mode: SplitMode;
  participants: Participant[]; // include { friend_id: null } for me
  payerFriendId: ID | null; // null = I paid
  payers?: { friend_id: ID | null; amount: number }[];
  groupId?: ID | null;
}

export interface NewTxnInput extends Partial<Transaction> {
  amount: number;
  split?: SplitInput | null;
}

/** Create a transaction (with split rows, merchant memory, round-ups) atomically. */
export function addTransaction(input: NewTxnInput, opts: { silent?: boolean } = {}): Transaction {
  const d = getData();
  const { split, ...fields } = input;
  const t = baseTxn(fields);
  const changes: Change[] = [];

  if (split && t.type === "expense") {
    const payer = split.payers?.length ? null : split.payerFriendId;
    const shares = computeSplit(t.amount, split.mode, split.participants, payer);
    const mine = shares.find((s) => s.friend_id === null)?.share ?? 0;
    t.my_share = mine;
    t.split_mode = split.mode;
    t.group_id = split.groupId ?? null;
    if (split.payers?.length) {
      t.payers = split.payers;
      if (!split.payers.some((p) => p.friend_id === null)) t.account_id = null;
    } else if (split.payerFriendId) {
      t.paid_by_friend_id = split.payerFriendId;
      t.account_id = null;
    }
    for (const s of shares) {
      changes.push(up("transaction_splits", { id: uid(), transaction_id: t.id, friend_id: s.friend_id, share: s.share } satisfies TransactionSplit));
    }
  }

  changes.unshift(up("transactions", t));

  // Merchant memory: remember category, method and account per merchant.
  if (t.merchant && t.type === "expense") {
    const key = merchantKey(t.merchant);
    const prev = d.merchant_memory.find((m) => m.id === key);
    changes.push(up("merchant_memory", {
      id: key, merchant: t.merchant, category_id: t.category_id ?? prev?.category_id ?? null,
      method: t.method, account_id: t.account_id ?? prev?.account_id ?? null, uses: (prev?.uses ?? 0) + 1,
    }));
  }

  // Virtual round-ups into goals.
  if (t.type === "expense" && !t.exclude_from_budget && !t.is_draft) {
    for (const g of d.goals.filter((x) => !x.archived && x.roundup_to > 0)) {
      const r = roundUp(t.my_share ?? t.amount, g.roundup_to);
      if (r > 0) changes.push(up("goal_contributions", { id: uid(), goal_id: g.id, amount: r, date: istDate(t.occurred_at), source: "roundup" }));
    }
  }

  commit(changes);
  if (!opts.silent) toast(`Saved ₹${t.amount.toLocaleString("en-IN")}${t.merchant ? ` · ${t.merchant}` : ""}`);
  return t;
}

export function updateTransaction(t: Transaction, patch: Partial<Transaction>, split?: SplitInput | null) {
  const d = getData();
  const before = d.transactions.find((x) => x.id === t.id);
  const changes: Change[] = [];
  let next: Transaction = { ...t, ...patch, updated_at: nowIso() };
  if (split !== undefined) {
    for (const s of d.transaction_splits.filter((s) => s.transaction_id === t.id)) changes.push(del("transaction_splits", s.id));
    next = { ...next, my_share: null, paid_by_friend_id: null, payers: null, split_mode: null, group_id: null };
    if (split) {
      const payer = split.payers?.length ? null : split.payerFriendId;
      const shares = computeSplit(next.amount, split.mode, split.participants, payer);
      next.my_share = shares.find((s) => s.friend_id === null)?.share ?? 0;
      next.split_mode = split.mode;
      next.group_id = split.groupId ?? null;
      if (split.payers?.length) next.payers = split.payers;
      else if (split.payerFriendId) { next.paid_by_friend_id = split.payerFriendId; next.account_id = null; }
      for (const s of shares) changes.push(up("transaction_splits", { id: uid(), transaction_id: t.id, friend_id: s.friend_id, share: s.share }));
    }
  }
  changes.unshift(up("transactions", next));
  changes.push(up("audit_log", { id: uid(), entity: "transactions", entity_id: t.id, action: "update", before, at: nowIso() }));
  commit(changes);
}

/** Soft delete with a 10-second undo; trash is purged after 30 days. */
export function deleteTransactions(ids: string[]) {
  const d = getData();
  const now = nowIso();
  const rows = d.transactions.filter((t) => ids.includes(t.id));
  commit([
    ...rows.map((t) => up("transactions", { ...t, deleted_at: now })),
    ...rows.map((t) => up("audit_log", { id: uid(), entity: "transactions", entity_id: t.id, action: "delete", before: t, at: now })),
  ]);
  toast(`Deleted ${rows.length} transaction${rows.length > 1 ? "s" : ""}`, {
    label: "Undo",
    run: () => restoreTransactions(ids),
  });
}

export function restoreTransactions(ids: string[]) {
  const d = getData();
  commit(d.transactions.filter((t) => ids.includes(t.id)).map((t) => up("transactions", { ...t, deleted_at: null })));
}

export function purgeTrash(today = istDate()) {
  const d = getData();
  const cutoff = addDays(today, -30);
  const old = d.transactions.filter((t) => t.deleted_at && istDate(t.deleted_at) < cutoff);
  if (!old.length) return;
  commit([
    ...d.transaction_splits.filter((s) => old.some((t) => t.id === s.transaction_id)).map((s) => del("transaction_splits", s.id)),
    ...old.map((t) => del("transactions", t.id)),
  ]);
}

export function bulkUpdate(ids: string[], patch: Partial<Transaction>) {
  const d = getData();
  commit(d.transactions.filter((t) => ids.includes(t.id)).map((t) => up("transactions", { ...t, ...patch, updated_at: nowIso() })));
  toast(`Updated ${ids.length} transactions`);
}

export function addRefund(orig: Transaction, amount: number, date: string) {
  addTransaction({
    type: "refund", amount, account_id: orig.account_id ?? defaultAccountFor("upi")?.id ?? null, method: orig.method,
    category_id: orig.category_id, merchant: orig.merchant, refund_of: orig.id, occurred_at: dateToTs(date), note: "Refund",
  });
}

export function confirmDraft(t: Transaction, amount?: number) {
  commit([up("transactions", { ...t, is_draft: false, amount: amount ?? t.amount, updated_at: nowIso() })]);
  toast("Confirmed");
}

// ---------------- credit cards ----------------

export function payCardBill(cardId: string, fromAccountId: string, amount: number, date: string) {
  addTransaction({
    type: "card_payment", amount, account_id: fromAccountId, to_account_id: cardId, method: "netbanking",
    occurred_at: dateToTs(date), note: "Card bill payment", merchant: "Card bill",
  }, { silent: true });
  toast(`Bill payment of ₹${amount.toLocaleString("en-IN")} recorded`);
}

export function convertToEmi(t: Transaction, tenure: number, rate: number, fee: number, gstPct = 18) {
  if (!t.account_id) return;
  const emi: CardEmi = {
    id: uid(), card_id: t.account_id, transaction_id: t.id, principal: t.amount, tenure_months: tenure,
    annual_rate: rate, processing_fee: fee, gst_pct: gstPct, start_date: addDays(istDate(t.occurred_at), 1), active: true,
  };
  const changes: Change[] = [up("card_emis", emi), up("transactions", { ...t, emi_id: emi.id, updated_at: nowIso() })];
  const feeCat = categoryByPath("Fees & charges › Card fees");
  if (fee > 0) {
    changes.push(up("transactions", baseTxn({
      amount: round2(fee * (1 + gstPct / 100)), account_id: t.account_id, method: "card", category_id: feeCat?.id ?? null,
      merchant: "EMI processing fee", emi_id: emi.id, note: `EMI on ${t.merchant ?? "purchase"}`,
    })));
  }
  commit(changes);
  toast(`Converted to ${tenure}-month EMI`);
}

/** Post EMI interest + GST as card charges once each installment date passes (job). */
export function postEmiCharges(today: string): Change[] {
  const d = getData();
  const cat = categoryByPath("Fees & charges › Interest", d.categories);
  const changes: Change[] = [];
  for (const e of d.card_emis.filter((x) => x.active)) {
    for (const i of emiSchedule(e)) {
      if (i.date > today || i.interest + i.gst <= 0) continue;
      const key = `emi-${e.id}-${i.n}`;
      if (d.transactions.some((t) => t.emi_id === e.id && t.note === key)) continue;
      changes.push(up("transactions", baseTxn({
        amount: round2(i.interest + i.gst), account_id: e.card_id, method: "card", category_id: cat?.id ?? null,
        merchant: "EMI interest + GST", emi_id: e.id, note: key, occurred_at: dateToTs(i.date, "00:30"),
      })));
    }
  }
  return changes;
}

export function setMinDueOverride(cardId: string, start: string, end: string, min: number | null) {
  const d = getData();
  const row = d.card_cycles.find((c) => c.card_id === cardId && c.start_date === start);
  commit([up("card_cycles", {
    id: row?.id ?? uid(), card_id: cardId, start_date: start, end_date: end, status: "closed",
    total_due: row?.total_due ?? null, min_due: row?.min_due ?? null, min_due_override: min, due_date: row?.due_date ?? null, amount_paid: row?.amount_paid ?? 0,
  })]);
}

// ---------------- recurring ----------------

export function saveRule(r: RecurringRule) {
  commit([up("recurring_rules", r)]);
}

export function newRule(p: Partial<RecurringRule> & { name: string; amount: number }): RecurringRule {
  return {
    id: uid(), kind: "bill", txn_type: "expense", amount_min: null, amount_max: null, frequency: "monthly",
    interval_days: null, due_day: 1, start_date: istDate(), end_date: null, account_id: null, to_account_id: null,
    method: "upi", category_id: null, auto_post: false, active: true, landlord: null, landlord_pan: null,
    property_address: null, escalation_pct: 0, deposit: 0, last_used_note: null, tags: [], ...p,
  };
}

export function deleteRule(id: string) {
  commit([del("recurring_rules", id)]);
}

export function occurrenceTxn(rule: RecurringRule, date: string, amount: number, draft: boolean): Transaction {
  const d = getData();
  const acc = rule.account_id ?? defaultAccountFor(rule.method, d)?.id ?? null;
  const type = rule.txn_type === "transfer" ? "transfer" : rule.txn_type;
  return baseTxn({
    type, amount, account_id: acc, to_account_id: rule.to_account_id, method: rule.method, category_id: rule.category_id,
    merchant: rule.landlord ?? rule.name, recurring_rule_id: rule.id, is_salary: rule.kind === "salary",
    occurred_at: dateToTs(date, "09:00"), is_draft: draft, note: draft ? "Confirm amount" : null, tags: rule.tags,
  });
}

export function postOccurrence(rule: RecurringRule, date: string, amount: number) {
  commit([up("transactions", occurrenceTxn(rule, date, amount, false))]);
  toast(`${rule.name} posted`);
}

// ---------------- IPO ----------------

export function applyIpo(p: Omit<IpoApplication, "id" | "status" | "shares_allotted" | "listing_price" | "sell_price" | "shares_sold" | "sold_date" | "realised_pnl" | "refund_received">) {
  const app: IpoApplication = {
    ...p, id: uid(), status: "blocked", shares_allotted: 0, listing_price: null, sell_price: null, shares_sold: 0,
    sold_date: null, realised_pnl: null, refund_received: false,
  };
  const hold: Hold = {
    id: uid(), account_id: p.account_id, amount: blockedAmount(p.lots, p.lot_size, p.bid_price), reason: "ipo",
    ipo_application_id: app.id, status: "active", created_at: nowIso(), released_at: null,
  };
  commit([up("ipo_applications", app), up("holds", hold)]);
  toast(`₹${hold.amount.toLocaleString("en-IN")} blocked for ${p.company}`);
  return app;
}

export function updateIpo(app: IpoApplication, patch: Partial<IpoApplication>) {
  const next = { ...app, ...patch };
  const changes: Change[] = [up("ipo_applications", next)];
  const hold = getData().holds.find((h) => h.ipo_application_id === app.id && h.status === "active");
  if (hold && (patch.lots !== undefined || patch.lot_size !== undefined || patch.bid_price !== undefined))
    changes.push(up("holds", { ...hold, amount: blockedAmount(next.lots, next.lot_size, next.bid_price) }));
  commit(changes);
}

/** Allotted / Not allotted / Partial: release the unused hold, move the rest to demat. */
export function recordAllotment(app: IpoApplication, shares: number, date: string, dematId: string | null, finalIssuePrice?: number) {
  const d = getData();
  const a = { ...app, issue_price: finalIssuePrice ?? app.issue_price };
  const { invested } = releaseOnAllotment(a, shares);
  const hold = d.holds.find((h) => h.ipo_application_id === app.id && h.status === "active");
  const status: IpoApplication["status"] = shares === 0 ? "not_allotted" : shares < appliedShares(app) ? "partial" : "allotted";
  const changes: Change[] = [up("ipo_applications", { ...a, status, shares_allotted: shares, allotment_date: date, refund_received: shares < appliedShares(app) })];
  if (hold) changes.push(up("holds", { ...hold, status: shares === 0 ? "released" : "converted", released_at: nowIso() }));
  if (shares > 0) {
    const demat = dematId ?? d.accounts.find((x) => x.type === "demat")?.id ?? null;
    const ipoCat = categoryByPath("Investments › IPO", d.categories);
    if (demat) {
      changes.push(up("transactions", baseTxn({
        type: "transfer", amount: invested, account_id: app.account_id, to_account_id: demat, method: "netbanking",
        merchant: `${app.company} IPO`, ipo_application_id: app.id, category_id: ipoCat?.id ?? null, occurred_at: dateToTs(date, "10:00"),
      })));
    }
    changes.push(up("holdings", {
      id: uid(), name: app.company, symbol: null, kind: "stock", quantity: shares, avg_cost: issuePrice(a),
      current_price: issuePrice(a), account_id: demat, ipo_application_id: app.id, buy_date: date, as_of: date,
    }));
  }
  commit(changes);
  toast(shares === 0 ? `Hold released for ${app.company}` : `${shares} shares of ${app.company} allotted`);
}

export function recordListing(app: IpoApplication, price: number) {
  const d = getData();
  const h = d.holdings.find((x) => x.ipo_application_id === app.id);
  const changes: Change[] = [up("ipo_applications", { ...app, listing_price: price, status: app.status === "sold" ? "sold" : "listed" })];
  if (h) changes.push(up("holdings", { ...h, current_price: price, as_of: istDate() }));
  commit(changes);
}

export function recordSale(app: IpoApplication, price: number, qty: number, date: string) {
  const d = getData();
  const sold = Math.min(app.shares_sold + qty, app.shares_allotted);
  // Weighted average sell price across partial sales.
  const avgSell = app.shares_sold > 0 && app.sell_price != null ? (app.sell_price * app.shares_sold + price * qty) / sold : price;
  const next: IpoApplication = { ...app, sell_price: round2(avgSell), shares_sold: sold, sold_date: date, status: sold >= app.shares_allotted ? "sold" : "holding" };
  next.realised_pnl = realisedPnl(next);
  const h = d.holdings.find((x) => x.ipo_application_id === app.id);
  const changes: Change[] = [up("ipo_applications", next)];
  if (h) {
    const left = h.quantity - qty;
    changes.push(left > 0 ? up("holdings", { ...h, quantity: left, current_price: price, as_of: date }) : del("holdings", h.id));
  }
  if (h?.account_id) {
    changes.push(up("transactions", baseTxn({
      type: "transfer", amount: round2(price * qty), account_id: h.account_id, to_account_id: app.account_id, method: "netbanking",
      merchant: `${app.company} sale`, ipo_application_id: app.id, occurred_at: dateToTs(date, "15:30"),
    })));
  }
  commit(changes);
  toast(`Sale recorded · P&L ₹${next.realised_pnl?.toLocaleString("en-IN")}`);
}

export function deleteIpo(app: IpoApplication) {
  const d = getData();
  commit([
    ...d.holds.filter((h) => h.ipo_application_id === app.id).map((h) => del("holds", h.id)),
    ...d.holdings.filter((h) => h.ipo_application_id === app.id).map((h) => del("holdings", h.id)),
    ...d.transactions.filter((t) => t.ipo_application_id === app.id).map((t) => up("transactions", { ...t, deleted_at: nowIso() })),
    del("ipo_applications", app.id),
  ]);
}

// ---------------- friends ----------------

const FRIEND_COLORS = ["#f97316", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#eab308", "#ef4444"];

export function newFriend(name: string, p: Partial<Friend> = {}): Friend {
  const n = getData().friends.length;
  return { id: uid(), name, upi_id: null, phone: null, color: FRIEND_COLORS[n % FRIEND_COLORS.length], archived: false, ...p };
}

export function saveFriend(f: Friend) {
  commit([up("friends", f)]);
}

/** Resolve names to friend ids, creating friends that don't exist yet. */
export function ensureFriends(names: string[]): Friend[] {
  const d = getData();
  const out: Friend[] = [];
  const created: Change[] = [];
  for (const name of names) {
    const ex = d.friends.find((f) => f.name.toLowerCase() === name.toLowerCase() || f.name.split(" ")[0].toLowerCase() === name.toLowerCase());
    if (ex) out.push(ex);
    else {
      const f = newFriend(name);
      created.push(up("friends", f));
      out.push(f);
    }
  }
  if (created.length) commit(created);
  return out;
}

export function saveGroup(id: string | null, name: string, emoji: string, memberIds: string[]) {
  const d = getData();
  const gid = id ?? uid();
  const existing = d.group_members.filter((m) => m.group_id === gid);
  commit([
    up("friend_groups", { id: gid, name, emoji }),
    ...existing.filter((m) => !memberIds.includes(m.friend_id)).map((m) => del("group_members", m.id)),
    ...memberIds.filter((f) => !existing.some((m) => m.friend_id === f)).map((f) => up("group_members", { id: uid(), group_id: gid, friend_id: f })),
  ]);
  return gid;
}

export function deleteGroup(id: string) {
  const d = getData();
  commit([...d.group_members.filter((m) => m.group_id === id).map((m) => del("group_members", m.id)), del("friend_groups", id)]);
}

export function settle(friendId: string, direction: "received" | "paid", amount: number, accountId: string | null, note?: string) {
  commit([up("settlements", { id: uid(), friend_id: friendId, direction, amount, date: istDate(), account_id: accountId, note: note ?? null })]);
  toast(direction === "received" ? `Received ₹${amount.toLocaleString("en-IN")}` : `Paid ₹${amount.toLocaleString("en-IN")}`);
}

export function deleteSettlement(id: string) {
  commit([del("settlements", id)]);
}

// ---------------- goals ----------------

export function saveGoal(g: Goal) {
  commit([up("goals", g)]);
}

export function newGoal(p: Partial<Goal> & { name: string; target: number }): Goal {
  return { id: uid(), kind: "goal", target_date: null, account_id: null, emoji: "🎯", roundup_to: 0, archived: false, created_at: nowIso(), ...p };
}

export function contribute(goalId: string, amount: number, source: "manual" | "leftover" | "auto" = "manual") {
  commit([up("goal_contributions", { id: uid(), goal_id: goalId, amount, date: istDate(), source })]);
  toast(`₹${amount.toLocaleString("en-IN")} added to goal`);
}

export function deleteGoal(id: string) {
  const d = getData();
  commit([...d.goal_contributions.filter((c) => c.goal_id === id).map((c) => del("goal_contributions", c.id)), del("goals", id)]);
}

// ---------------- budgets, rules, templates, holdings ----------------

export function saveBudgetLine(categoryId: string, amount: number, rollover: boolean, id?: string) {
  commit([up("budget_lines", { id: id ?? uid(), category_id: categoryId, amount, rollover })]);
}
export const deleteBudgetLine = (id: string) => commit([del("budget_lines", id)]);

export function saveRuleEngine(match: string, categoryId: string | null, method: PayMethod | null, accountId: string | null, id?: string) {
  commit([up("rules", { id: id ?? uid(), match, category_id: categoryId, method, account_id: accountId })]);
}
export const deleteRuleEngine = (id: string) => commit([del("rules", id)]);

export function saveTemplate(label: string, text: string, emoji: string, id?: string) {
  commit([up("templates", { id: id ?? uid(), label, text, emoji })]);
}
export const deleteTemplate = (id: string) => commit([del("templates", id)]);

export function saveHolding(h: Partial<Tables["holdings"][number]> & { name: string }) {
  commit([up("holdings", { id: uid(), symbol: null, kind: "stock", quantity: 0, avg_cost: 0, current_price: 0, account_id: null, ipo_application_id: null, buy_date: null, as_of: istDate(), ...h })]);
}
export const deleteHolding = (id: string) => commit([del("holdings", id)]);

// ---------------- daily habit ----------------

/** Close (review) a day: snapshots its spend vs allowance for streaks and badges. */
export function closeDay(date: string, spent: number, allowance: number, mood: string | null, note: string | null) {
  commit([up("day_logs", { id: date, date, mood, note, spent: round2(spent), allowance: round2(allowance), closed_at: nowIso() })]);
}

export const reopenDay = (date: string) => commit([del("day_logs", date)]);

// ---------------- notifications ----------------

export function markNotificationsRead(ids?: string[]) {
  const d = getData();
  commit(d.notifications.filter((n) => !n.read && (!ids || ids.includes(n.id))).map((n) => up("notifications", { ...n, read: true })));
}

export function clearNotifications() {
  const d = getData();
  commit(d.notifications.map((n) => del("notifications", n.id)));
}

export { up, del, commit };
