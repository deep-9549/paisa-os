// Friends ledger — PRD 4.7 and section 9 "Friends ledger rules".
// Positive balance = the friend owes me; negative = I owe the friend.

import type { ID, Payer, Settlement, SplitMode, Transaction, TransactionSplit } from "../types";
import { isLive } from "./ledger";
import { fromPaise, round2, toPaise } from "./money";

export interface Participant {
  friend_id: ID | null; // null = me
  /** exact: rupees · percent: % · shares: weight · itemised: item total · equal: ignored */
  value?: number;
}

export interface SplitShare {
  friend_id: ID | null;
  share: number;
}

/**
 * Split a bill so shares sum exactly to the total; leftover paise go to the payer
 * (or to the first participant if the payer isn't in the split).
 */
export function computeSplit(
  total: number,
  mode: SplitMode,
  participants: Participant[],
  payer: ID | null,
): SplitShare[] {
  if (participants.length === 0) throw new Error("Split needs at least one person");
  const T = toPaise(total);
  let weights: number[];
  switch (mode) {
    case "equal":
      weights = participants.map(() => 1);
      break;
    case "exact": {
      const shares = participants.map((p) => toPaise(p.value ?? 0));
      const s = shares.reduce((a, b) => a + b, 0);
      if (s !== T) throw new Error(`Exact amounts add up to ₹${fromPaise(s)}, bill is ₹${total}`);
      return participants.map((p, i) => ({ friend_id: p.friend_id, share: fromPaise(shares[i]) }));
    }
    case "percent": {
      const pct = participants.reduce((a, p) => a + (p.value ?? 0), 0);
      if (Math.abs(pct - 100) > 0.001) throw new Error(`Percentages add up to ${round2(pct)}%, not 100%`);
      weights = participants.map((p) => p.value ?? 0);
      break;
    }
    case "shares":
    case "itemised":
      // Itemised: each person's items, with tax/tip shared in proportion.
      weights = participants.map((p) => Math.max(p.value ?? 0, 0));
      if (weights.every((w) => w === 0)) throw new Error("Enter at least one share");
      if (mode === "itemised") {
        const items = weights.reduce((a, b) => a + toPaise(b), 0);
        if (items > T) throw new Error("Items add up to more than the bill");
      }
      break;
  }
  const W = weights.reduce((a, b) => a + b, 0);
  const paise = weights.map((w) => Math.floor((T * w) / W));
  const rem = T - paise.reduce((a, b) => a + b, 0);
  const payerIdx = Math.max(
    participants.findIndex((p) => p.friend_id === payer),
    0,
  );
  paise[payerIdx] += rem;
  return participants.map((p, i) => ({ friend_id: p.friend_id, share: fromPaise(paise[i]) }));
}

/** Who paid how much for a bill. */
export function payersOf(t: Transaction): Payer[] {
  if (t.payers && t.payers.length) return t.payers;
  return [{ friend_id: t.paid_by_friend_id, amount: t.amount }];
}

/**
 * Pairwise effect of one shared bill on my balance with each friend.
 * Each person's net = paid − share. Debtors pay creditors in proportion to
 * credit, so with a single payer this reduces to the PRD rule:
 * I paid → each friend owes me their share; friend paid → I owe them my share.
 */
export function billEffect(t: Transaction, splits: TransactionSplit[]): Map<ID, number> {
  const out = new Map<ID, number>();
  const key = (id: ID | null) => id ?? "me";
  const net = new Map<string, number>();
  for (const p of payersOf(t)) net.set(key(p.friend_id), (net.get(key(p.friend_id)) ?? 0) + toPaise(p.amount));
  for (const s of splits) net.set(key(s.friend_id), (net.get(key(s.friend_id)) ?? 0) - toPaise(s.share));
  const mine = net.get("me") ?? 0;
  if (mine === 0) return out;
  const credit = [...net.values()].filter((v) => v > 0).reduce((a, b) => a + b, 0);
  if (credit === 0) return out;
  for (const [person, v] of net) {
    if (person === "me") continue;
    if (mine > 0 && v < 0) out.set(person, fromPaise(Math.round((-v * mine) / credit))); // they owe me
    if (mine < 0 && v > 0) out.set(person, -fromPaise(Math.round((-mine * v) / credit))); // I owe them
  }
  return out;
}

export interface FriendBalance {
  friend_id: ID;
  balance: number;
  /** Date of the oldest unsettled activity (approximate, for reminders). */
  since: string | null;
}

export function friendBalances(
  txns: Transaction[],
  splits: TransactionSplit[],
  settlements: Settlement[],
): Map<ID, number> {
  const byTxn = new Map<ID, TransactionSplit[]>();
  for (const s of splits) {
    const arr = byTxn.get(s.transaction_id) ?? [];
    arr.push(s);
    byTxn.set(s.transaction_id, arr);
  }
  const bal = new Map<ID, number>();
  for (const t of txns) {
    if (!isLive(t) || t.type !== "expense") continue;
    const sp = byTxn.get(t.id);
    if (!sp) continue;
    for (const [f, v] of billEffect(t, sp)) bal.set(f, (bal.get(f) ?? 0) + toPaise(v));
  }
  for (const s of settlements) {
    const d = s.direction === "received" ? -toPaise(s.amount) : toPaise(s.amount);
    bal.set(s.friend_id, (bal.get(s.friend_id) ?? 0) + d);
  }
  const out = new Map<ID, number>();
  for (const [f, p] of bal) out.set(f, fromPaise(p));
  return out;
}

/** Day the current balance with a friend started (last time it was zero). */
export function balanceSince(
  friendId: ID,
  txns: Transaction[],
  splits: TransactionSplit[],
  settlements: Settlement[],
): string | null {
  type Ev = { date: string; delta: number };
  const evs: Ev[] = [];
  const byTxn = new Map<ID, TransactionSplit[]>();
  for (const s of splits) byTxn.set(s.transaction_id, [...(byTxn.get(s.transaction_id) ?? []), s]);
  for (const t of txns) {
    if (!isLive(t) || t.type !== "expense" || !byTxn.has(t.id)) continue;
    const v = billEffect(t, byTxn.get(t.id)!).get(friendId);
    if (v) evs.push({ date: t.occurred_at.slice(0, 10), delta: toPaise(v) });
  }
  for (const s of settlements.filter((x) => x.friend_id === friendId))
    evs.push({ date: s.date, delta: s.direction === "received" ? -toPaise(s.amount) : toPaise(s.amount) });
  evs.sort((a, b) => a.date.localeCompare(b.date));
  let run = 0;
  let since: string | null = null;
  for (const e of evs) {
    if (run === 0 && e.delta !== 0) since = e.date;
    run += e.delta;
    if (run === 0) since = null;
  }
  return since;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * Greedy max-creditor / max-debtor simplification. `nets`: positive = is owed.
 * Only suggests transfers; history is never changed.
 */
export function simplifyDebts(nets: Map<string, number>): Transfer[] {
  const cred = [...nets].filter(([, v]) => toPaise(v) > 0).map(([k, v]) => ({ k, v: toPaise(v) }));
  const debt = [...nets].filter(([, v]) => toPaise(v) < 0).map(([k, v]) => ({ k, v: -toPaise(v) }));
  const out: Transfer[] = [];
  for (let guard = 0; guard < 1000 && cred.length && debt.length; guard++) {
    cred.sort((a, b) => b.v - a.v);
    debt.sort((a, b) => b.v - a.v);
    const c = cred[0];
    const d = debt[0];
    const x = Math.min(c.v, d.v);
    out.push({ from: d.k, to: c.k, amount: fromPaise(x) });
    c.v -= x;
    d.v -= x;
    if (c.v === 0) cred.shift();
    if (d.v === 0) debt.shift();
  }
  return out;
}

/** Net position of every member (incl. "me") from a group's bills. */
export function groupNets(txns: Transaction[], splits: TransactionSplit[], groupId: ID): Map<string, number> {
  const key = (id: ID | null) => id ?? "me";
  const nets = new Map<string, number>();
  const byTxn = new Map<ID, TransactionSplit[]>();
  for (const s of splits) byTxn.set(s.transaction_id, [...(byTxn.get(s.transaction_id) ?? []), s]);
  for (const t of txns) {
    if (!isLive(t) || t.group_id !== groupId || !byTxn.has(t.id)) continue;
    for (const p of payersOf(t)) nets.set(key(p.friend_id), (nets.get(key(p.friend_id)) ?? 0) + toPaise(p.amount));
    for (const s of byTxn.get(t.id)!) nets.set(key(s.friend_id), (nets.get(key(s.friend_id)) ?? 0) - toPaise(s.share));
  }
  const out = new Map<string, number>();
  for (const [k, v] of nets) out.set(k, fromPaise(v));
  return out;
}

export function upiPayLink(pa: string, name: string, amount: number, note: string): string {
  const q = new URLSearchParams({ pa, pn: name, am: amount.toFixed(2), tn: note, cu: "INR" });
  return `upi://pay?${q.toString()}`;
}

export function whatsappRequest(phone: string | null, text: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const num = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
