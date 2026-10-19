// "Ask Paisa": plain-English questions about your money, answered on-device.
//
//   "how much on food last month"     → total, count, vs the month before
//   "swiggy this week", "uber in sep" → merchant spend in a period
//   "biggest spend this month"        → the largest expense
//   "where did my money go"           → top categories
//   "can I afford 4000"               → checks Safe-to-Spend
//   "who owes me", "rahul"            → friend balances
//   "card bill", "net worth", "average per day"
//
// No network and no model: a small keyword grammar over the local ledger.

import type { Category, DateStr, Friend, Transaction } from "../types";
import type { Cycle } from "./cycle";
import { addDays, clampedDate, diffDays, fmtDate, parseDate } from "./dates";
import { budgetImpact, isLive, txnDate } from "./ledger";
import { formatINR, parseAmount, round2 } from "./money";
import { keywordCategory } from "./parser";

export interface AskContext {
  today: DateStr;
  cycle: Cycle;
  prevCycle: Cycle;
  txns: Transaction[];
  categories: Category[];
  friends: Friend[];
  friendBalances: Map<string, number>;
  safe: { month: number; todayLeft: number; dailyAllowance: number; daysLeft: number; trueCash: number };
  netWorth: number;
  cards: { name: string; due: number; dueDate: DateStr | null; unbilled: number; href: string }[];
}

export interface Period {
  label: string;
  start: DateStr;
  end: DateStr;
  /** The same-length period just before, for comparisons. */
  prev?: { label: string; start: DateStr; end: DateStr };
}

export interface Answer {
  kind: "spend" | "biggest" | "where" | "afford" | "owe" | "card" | "networth" | "average" | "safe" | "none";
  title: string;
  text: string;
  value?: number;
  tone?: "good" | "warn" | "bad";
  txns?: Transaction[];
  breakdown?: { label: string; value: number; icon?: string }[];
  href?: string;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function parsePeriod(q: string, today: DateStr, cycle: Cycle, prevCycle: Cycle): { period: Period; matched: boolean } {
  const s = q.toLowerCase();
  const day = (d: DateStr, label: string): Period => ({ label, start: d, end: d, prev: { label: "the day before", start: addDays(d, -1), end: addDays(d, -1) } });
  if (/\btoday\b/.test(s)) return { period: day(today, "today"), matched: true };
  if (/\b(yesterday|yday)\b/.test(s)) return { period: day(addDays(today, -1), "yesterday"), matched: true };
  const wd = (parseDate(today).getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = addDays(today, -wd);
  if (/\blast week\b/.test(s)) {
    const st = addDays(weekStart, -7);
    return { period: { label: "last week", start: st, end: addDays(st, 6), prev: { label: "the week before", start: addDays(st, -7), end: addDays(st, -1) } }, matched: true };
  }
  if (/\b(this week|week)\b/.test(s)) {
    return { period: { label: "this week", start: weekStart, end: today, prev: { label: "the same days last week", start: addDays(weekStart, -7), end: addDays(today, -7) } }, matched: true };
  }
  const lastN = s.match(/\b(?:last|past)\s+(\d{1,3})\s+days?\b/);
  if (lastN) {
    const n = Math.max(1, parseInt(lastN[1], 10));
    const st = addDays(today, -(n - 1));
    return { period: { label: `the last ${n} days`, start: st, end: today, prev: { label: `the ${n} days before`, start: addDays(st, -n), end: addDays(st, -1) } }, matched: true };
  }
  if (/\blast month\b/.test(s)) {
    const len = prevCycle.length;
    return { period: { label: "last month", start: prevCycle.start, end: prevCycle.end, prev: { label: "the month before", start: addDays(prevCycle.start, -len), end: addDays(prevCycle.start, -1) } }, matched: true };
  }
  if (/\blast year\b/.test(s)) {
    const y = String(parseInt(today.slice(0, 4), 10) - 1);
    return { period: { label: `in ${y}`, start: `${y}-01-01`, end: `${y}-12-31` }, matched: true };
  }
  if (/\b(this year|year)\b/.test(s)) {
    const y = today.slice(0, 4);
    return { period: { label: `in ${y}`, start: `${y}-01-01`, end: today }, matched: true };
  }
  if (/\b(ever|all time|overall|total)\b/.test(s)) return { period: { label: "all time", start: "1900-01-01", end: today }, matched: true };
  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\b(${MONTHS[i]}|${MONTHS[i].slice(0, 3)})\\b(?:\\s+(\\d{4}))?`);
    const m = s.match(re);
    if (!m || (MONTHS[i] === "may" && !/\bin may\b|\bmay \d{4}\b/.test(s))) continue;
    const t = parseDate(today);
    let y = m[2] ? parseInt(m[2], 10) : t.getUTCFullYear();
    if (!m[2] && i > t.getUTCMonth()) y -= 1; // "december" in October means last December
    const start = clampedDate(y, i, 1);
    const end = clampedDate(y, i, 31);
    const name = MONTHS[i][0].toUpperCase() + MONTHS[i].slice(1);
    return { period: { label: `in ${name} ${y}`, start, end: end > today ? today : end, prev: { label: "the month before", start: clampedDate(y, i - 1, 1), end: clampedDate(y, i - 1, 31) } }, matched: true };
  }
  const len = cycle.length;
  return {
    period: { label: "this month", start: cycle.start, end: today, prev: { label: "the same point last month", start: addDays(cycle.start, -len), end: addDays(today, -len) } },
    matched: false,
  };
}

const NOISE = new Set([
  "how", "much", "many", "did", "do", "does", "i", "my", "me", "spend", "spent", "spending", "on", "in", "at", "for", "the", "a", "an",
  "this", "last", "past", "week", "month", "year", "today", "yesterday", "yday", "what", "was", "is", "are", "of", "total", "all", "time",
  "ever", "overall", "money", "go", "went", "where", "show", "tell", "about", "with", "from", "to", "so", "far", "days", "day", "times",
  "often", "have", "has", "been", "and", "or", "rs", "₹", "?", "please", "pay", "paid", "expense", "expenses", "amount", "cost",
  ...MONTHS, ...MONTHS.map((m) => m.slice(0, 3)),
]);

function subjectWords(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[?!.,]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w) && !/^\d+$/.test(w));
}

interface Filter {
  label: string;
  test: (t: Transaction) => boolean;
}

/** Work out what the question is about: a #tag, a merchant, or a category. */
function subjectFilter(words: string[], ctx: AskContext): Filter | null {
  if (!words.length) return null;
  const phrase = words.join(" ");
  const tag = words.find((w) => w.startsWith("#"));
  if (tag) return { label: tag, test: (t) => t.tags.includes(tag.slice(1)) };

  // Merchant: the phrase appears in a merchant name you've used.
  const merchants = new Set(ctx.txns.filter((t) => t.merchant).map((t) => t.merchant!.toLowerCase()));
  const hit = [...merchants].find((m) => m.includes(phrase)) ?? [...merchants].find((m) => words.every((w) => m.includes(w)));
  if (hit) {
    const display = ctx.txns.find((t) => t.merchant?.toLowerCase() === hit)?.merchant ?? phrase;
    return { label: display, test: (t) => !!t.merchant && t.merchant.toLowerCase().includes(phrase.length >= 3 ? phrase : hit) };
  }

  // Category by name ("food", "transport", "groceries") or keyword ("chai" → Tea & snacks).
  const byName =
    ctx.categories.find((c) => c.name.toLowerCase() === phrase) ??
    ctx.categories.find((c) => c.name.toLowerCase().startsWith(phrase) && phrase.length >= 3) ??
    ctx.categories.find((c) => words.some((w) => w.length >= 4 && c.name.toLowerCase().split(/[^a-z]+/).includes(w)));
  let cat = byName;
  if (!cat) {
    const path = keywordCategory(phrase);
    if (path) {
      const [p, ch] = path.split("›").map((x) => x.trim().toLowerCase());
      const parent = ctx.categories.find((c) => !c.parent_id && c.name.toLowerCase() === p);
      cat = (ch && ctx.categories.find((c) => c.parent_id === parent?.id && c.name.toLowerCase() === ch)) || parent;
    }
  }
  if (cat) {
    const ids = new Set([cat.id, ...ctx.categories.filter((c) => c.parent_id === cat!.id).map((c) => c.id)]);
    return { label: `${cat.icon} ${cat.name}`, test: (t) => !!t.category_id && ids.has(t.category_id) };
  }
  return null;
}

const inRange = (t: Transaction, p: { start: DateStr; end: DateStr }) => {
  const d = txnDate(t);
  return d >= p.start && d <= p.end;
};

function spendOf(txns: Transaction[], p: { start: DateStr; end: DateStr }, f: Filter | null) {
  const list = txns.filter((t) => isLive(t) && budgetImpact(t) !== 0 && inRange(t, p) && (!f || f.test(t)));
  return { total: round2(list.reduce((a, t) => a + budgetImpact(t), 0)), list };
}

export function ask(question: string, ctx: AskContext): Answer {
  const q = question.trim().toLowerCase();
  if (!q) return { kind: "none", title: "Ask anything about your money", text: "Try “food this month” or “can I afford 3000”." };
  const { period } = parsePeriod(q, ctx.today, ctx.cycle, ctx.prevCycle);
  const amount = q.match(/(?:₹|rs\.?\s?)?(\d[\d,]*(?:\.\d+)?\s?(?:k|l|lakh)?)\b/i);

  // Can I afford X?
  if (/\b(afford|can i (buy|spend|get))\b/.test(q)) {
    const want = amount ? parseAmount(amount[1].replace(/\s/g, "")) : null;
    if (!want) return { kind: "afford", title: "Can I afford it?", text: "Add an amount, like “can I afford 4500”." };
    const { month, todayLeft, daysLeft } = ctx.safe;
    const after = round2(month - want);
    const perDay = daysLeft > 0 ? after / daysLeft : after;
    if (want <= todayLeft) return { kind: "afford", title: `Yes — ${formatINR(want)} fits today`, text: `It's within today's ${formatINR(todayLeft)}. You'd still have ${formatINR(after)} left this month.`, value: after, tone: "good", href: "/" };
    if (after >= 0) return { kind: "afford", title: `Yes, but it stretches the month`, text: `You'd have ${formatINR(after)} for ${daysLeft} day${daysLeft === 1 ? "" : "s"} — about ${formatINR(Math.round(perDay))}/day after this.`, value: after, tone: "warn", href: "/" };
    return { kind: "afford", title: "Not this month", text: `That would put you ${formatINR(-after)} over budget. Consider waiting ${daysLeft} day${daysLeft === 1 ? "" : "s"} for the new month, or using a goal.`, value: after, tone: "bad", href: "/plan/goals" };
  }

  // Friends
  const friend = ctx.friends.find((f) => new RegExp(`\\b${f.name.split(/\s+/)[0].toLowerCase()}\\b`).test(q));
  if (/\b(owe|owes|owed|lent|borrow|friends?|settle)\b/.test(q) || (friend && !/\b(spend|spent|split)\b/.test(q))) {
    if (friend) {
      const v = ctx.friendBalances.get(friend.id) ?? 0;
      return {
        kind: "owe",
        title: v > 0 ? `${friend.name} owes you ${formatINR(v)}` : v < 0 ? `You owe ${friend.name} ${formatINR(-v)}` : `You and ${friend.name} are settled`,
        text: v === 0 ? "Nothing pending either way." : "Open their page to settle up over UPI or send a reminder.",
        value: v,
        tone: v >= 0 ? "good" : "warn",
        href: `/friends/${friend.id}`,
      };
    }
    const rows = [...ctx.friendBalances].filter(([, v]) => Math.abs(v) >= 0.01).map(([id, v]) => ({ label: ctx.friends.find((f) => f.id === id)?.name ?? "Friend", value: v })).sort((a, b) => b.value - a.value);
    const owed = rows.filter((r) => r.value > 0).reduce((a, r) => a + r.value, 0);
    const owe = rows.filter((r) => r.value < 0).reduce((a, r) => a - r.value, 0);
    return {
      kind: "owe",
      title: rows.length ? `Friends owe you ${formatINR(owed)}` : "All settled up",
      text: rows.length ? `You owe ${formatINR(owe)}. Positive means they owe you.` : "No pending balances with anyone.",
      breakdown: rows,
      tone: "good",
      href: "/friends",
    };
  }

  // Card bills
  if (/\b(card|credit|bill due|statement)\b/.test(q) && ctx.cards.length) {
    const total = ctx.cards.reduce((a, c) => a + c.due + c.unbilled, 0);
    const next = [...ctx.cards].filter((c) => c.dueDate && c.due > 0).sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))[0];
    return {
      kind: "card",
      title: next ? `${formatINR(next.due)} due ${fmtDate(next.dueDate!)}` : `${formatINR(total)} on your cards`,
      text: next ? `${next.name}${next.dueDate ? ` · ${diffDays(next.dueDate, ctx.today)} day(s) left` : ""}. Total outstanding incl. unbilled: ${formatINR(total)}.` : "No statement due right now; this is the unbilled amount.",
      breakdown: ctx.cards.map((c) => ({ label: c.name, value: -(c.due + c.unbilled) })),
      href: next?.href ?? "/cards",
    };
  }

  if (/\bnet ?worth\b|\bworth\b/.test(q)) {
    return { kind: "networth", title: `Net worth ${formatINR(ctx.netWorth)}`, text: "Bank, cash and investments minus card dues and loans.", value: ctx.netWorth, href: "/invest/portfolio" };
  }

  if (/\b(safe to spend|left|remaining|budget left|how much can i)\b/.test(q) && !subjectWords(q).length) {
    return {
      kind: "safe",
      title: `${formatINR(ctx.safe.todayLeft)} left today`,
      text: `${formatINR(ctx.safe.month)} left this month across ${ctx.safe.daysLeft} day(s) · true cash ${formatINR(ctx.safe.trueCash)}.`,
      value: ctx.safe.todayLeft,
      tone: ctx.safe.month < 0 ? "bad" : "good",
      href: "/",
    };
  }

  const words = subjectWords(q).filter((w) => !["biggest", "largest", "most", "expensive", "average", "avg", "per", "daily", "top", "categories", "category", "breakdown", "spends", "transactions"].includes(w));
  const filter = subjectFilter(words, ctx);
  const effective = period;

  if (/\b(biggest|largest|most expensive|highest)\b/.test(q)) {
    const { list } = spendOf(ctx.txns, effective, filter);
    const top = [...list].sort((a, b) => budgetImpact(b) - budgetImpact(a)).slice(0, 5);
    if (!top.length) return { kind: "biggest", title: "Nothing found", text: `No spends ${filter ? `on ${filter.label} ` : ""}${effective.label}.` };
    return { kind: "biggest", title: `${top[0].merchant ?? "Expense"} · ${formatINR(budgetImpact(top[0]))}`, text: `Your biggest spend${filter ? ` on ${filter.label}` : ""} ${effective.label} (${fmtDate(txnDate(top[0]))}).`, txns: top, value: budgetImpact(top[0]) };
  }

  if (/\b(where|breakdown|top categor|categories|most on)\b/.test(q)) {
    const { list, total } = spendOf(ctx.txns, effective, null);
    const parent = (id: string | null) => {
      const c = ctx.categories.find((x) => x.id === id);
      return c?.parent_id ? ctx.categories.find((x) => x.id === c.parent_id) : c;
    };
    const by = new Map<string, { label: string; icon?: string; value: number }>();
    for (const t of list) {
      const c = parent(t.category_id);
      const k = c?.id ?? "none";
      const cur = by.get(k) ?? { label: c?.name ?? "Uncategorised", icon: c?.icon, value: 0 };
      cur.value = round2(cur.value + budgetImpact(t));
      by.set(k, cur);
    }
    const rows = [...by.values()].sort((a, b) => b.value - a.value).slice(0, 6);
    return {
      kind: "where",
      title: rows.length ? `Most went to ${rows[0].label}` : "No spending yet",
      text: rows.length ? `${formatINR(rows[0].value)} of ${formatINR(total)} ${effective.label} (${Math.round((rows[0].value / Math.max(total, 1)) * 100)}%).` : `Nothing spent ${effective.label}.`,
      breakdown: rows.map((r) => ({ label: r.label, value: r.value, icon: r.icon })),
      href: "/reports",
    };
  }

  const { total, list } = spendOf(ctx.txns, effective, filter);

  if (/\b(average|avg|per day|daily)\b/.test(q)) {
    const days = Math.max(diffDays(effective.end < ctx.today ? effective.end : ctx.today, effective.start) + 1, 1);
    const avg = round2(total / days);
    return { kind: "average", title: `${formatINR(avg)} a day`, text: `Average${filter ? ` on ${filter.label}` : ""} ${effective.label} over ${days} day${days === 1 ? "" : "s"} (${formatINR(total)} total).`, value: avg };
  }

  if (words.length && !filter) {
    return { kind: "none", title: `Couldn't find “${words.join(" ")}”`, text: "Try a merchant (swiggy), a category (food, transport), a #tag, or a question like “can I afford 2000”." };
  }

  let compare = "";
  let tone: Answer["tone"];
  if (effective.prev) {
    const before = spendOf(ctx.txns, effective.prev, filter).total;
    if (before > 0) {
      const ch = (total - before) / before;
      compare = ` ${Math.abs(Math.round(ch * 100))}% ${ch <= 0 ? "less" : "more"} than ${effective.prev.label}.`;
      tone = ch <= 0 ? "good" : ch > 0.2 ? "bad" : "warn";
    }
  }
  const n = list.length;
  return {
    kind: "spend",
    title: `${formatINR(total)} ${filter ? `on ${filter.label} ` : ""}${effective.label}`,
    text: `${n} spend${n === 1 ? "" : "s"}${n ? `, avg ${formatINR(Math.round(total / n))}` : ""}.${compare}`,
    value: total,
    tone,
    txns: [...list].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 8),
  };
}

export const ASK_SUGGESTIONS = [
  "Food this month",
  "Where did my money go?",
  "Biggest spend this month",
  "Can I afford 3000?",
  "Who owes me?",
  "Swiggy last month",
  "Average per day this week",
  "Card bill",
];
