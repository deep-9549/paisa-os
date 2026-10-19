// Natural-language quick-add — PRD 4.2 and flow F2.
//   "450 swiggy card"                     → ₹450 · Food › Delivery · card
//   "1200 dinner upi split rahul amit"    → split equally with Rahul and Amit
//   "3600 dinner paid by rahul split rahul amit"
//   "50000 salary income", "yesterday 80 auto cash #office"

import type { PayMethod } from "../types";
import { KEYWORDS } from "./categories";
import { parseAmount } from "./money";

export interface ParsedQuickAdd {
  amount: number | null;
  type: "expense" | "income" | "refund";
  method: PayMethod | null;
  /** RuPay-on-UPI: keyword `rupay`/`card` forces the card. */
  forceCard: boolean;
  merchant: string | null;
  categoryPath: string | null;
  splitWith: string[]; // friend name tokens
  paidBy: string | null; // friend name token
  tags: string[];
  daysAgo: number;
  note: string | null;
}

const METHOD_WORDS: Record<string, PayMethod> = {
  upi: "upi", gpay: "upi", phonepe: "upi", paytm: "upi", bhim: "upi",
  card: "card", cc: "card", credit: "card", rupay: "card",
  cash: "cash", nb: "netbanking", netbanking: "netbanking", neft: "netbanking", imps: "netbanking",
  autodebit: "auto_debit", "auto-debit": "auto_debit", nach: "auto_debit",
};

const STOP = new Set(["for", "at", "on", "to", "the", "a", "via", "with", "using", "and", "paid", "spent", "rs", "inr"]);

export interface ParseContext {
  friendNames: string[];
  /** Merchant memory lookup, returns a category path if known. */
  memoryCategory?: (merchant: string) => string | null;
}

export function parseQuickAdd(input: string, ctx: ParseContext = { friendNames: [] }): ParsedQuickAdd {
  const out: ParsedQuickAdd = {
    amount: null, type: "expense", method: null, forceCard: false, merchant: null,
    categoryPath: null, splitWith: [], paidBy: null, tags: [], daysAgo: 0, note: null,
  };
  const friendsLower = ctx.friendNames.map((n) => n.toLowerCase());
  const matchFriend = (tok: string) => {
    const t = tok.toLowerCase();
    const i = friendsLower.findIndex((f) => f === t || f.split(/\s+/)[0] === t);
    return i >= 0 ? ctx.friendNames[i] : null;
  };

  // Notes in quotes: 450 swiggy "team lunch"
  let text = input.trim();
  const q = text.match(/"([^"]*)"/);
  if (q) {
    out.note = q[1];
    text = text.replace(q[0], " ");
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  const words: string[] = [];
  let mode: "none" | "split" | "paidby" = "none";

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    const t = raw.toLowerCase();

    if (t.startsWith("#") && t.length > 1) { out.tags.push(t.slice(1)); continue; }
    if (out.amount === null) {
      const amt = parseAmount(raw);
      if (amt !== null && amt > 0) { out.amount = amt; continue; }
    }
    if (t === "yesterday" || t === "yday" || t === "y'day") { out.daysAgo = 1; continue; }
    if (t === "today") continue;
    if (/^\d+d$/.test(t)) { out.daysAgo = parseInt(t, 10); continue; }
    if (t === "income" || t === "received") { out.type = "income"; continue; }
    if (t === "refund") { out.type = "refund"; continue; }
    if (t === "salary") { out.type = "income"; out.categoryPath = "Income › Salary"; words.push(raw); continue; }
    if (t === "split") { mode = "split"; continue; }
    if (t === "paid" && tokens[i + 1]?.toLowerCase() === "by") { mode = "paidby"; i++; continue; }
    if (t === "paidby") { mode = "paidby"; continue; }
    if (METHOD_WORDS[t]) {
      out.method = METHOD_WORDS[t];
      if (t === "rupay" || t === "card" || t === "cc") out.forceCard = true;
      continue;
    }
    // Names after "split" / "paid by" are friends; unknown names become new friends.
    if (mode === "paidby") {
      mode = "none";
      if (t !== "me") { out.paidBy = matchFriend(t) ?? titleCase(raw); continue; }
      continue;
    }
    if (mode === "split") {
      if (t === "me") continue;
      out.splitWith.push(matchFriend(t) ?? titleCase(raw));
      continue;
    }
    // "rahul paid" form
    if (t === "paid" && words.length) {
      const prev = matchFriend(words[words.length - 1]);
      if (prev) { out.paidBy = prev; words.pop(); continue; }
    }
    if (STOP.has(t)) continue;
    words.push(raw);
  }

  if (words.length) out.merchant = titleCase(words.join(" "));
  if (out.paidBy && !out.splitWith.includes(out.paidBy)) out.splitWith.unshift(out.paidBy);

  if (!out.categoryPath && out.merchant) {
    out.categoryPath = ctx.memoryCategory?.(out.merchant) ?? keywordCategory(out.merchant);
  }
  if (out.categoryPath?.startsWith("Income") && out.type === "expense") out.type = "income";
  return out;
}

export function keywordCategory(text: string): string | null {
  const lower = text.toLowerCase();
  const toks = lower.split(/[^a-z0-9]+/).filter(Boolean);
  for (const tok of toks) if (KEYWORDS[tok]) return KEYWORDS[tok];
  const keys = Object.keys(KEYWORDS).sort((a, b) => b.length - a.length);
  const hit = keys.find((k) => k.length >= 4 && lower.includes(k));
  return hit ? KEYWORDS[hit] : null;
}

export function titleCase(s: string): string {
  return s.replace(/\S+/g, (w) => (w.length <= 2 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1)));
}

export const merchantKey = (m: string) => m.trim().toLowerCase().replace(/\s+/g, " ");
