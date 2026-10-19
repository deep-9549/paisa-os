"use client";

// First-time setup (flow F1) and the optional demo dataset.

import { SUGGESTED_SPLIT } from "../domain/budgets";
import { cardCycleFor } from "../domain/cards";
import { addDays, dateToTs, istDate } from "../domain/dates";
import { computeSplit } from "../domain/friends";
import type { Account, CreditCard, CycleSetting, Profile, Tables, Transaction } from "../types";
import { PROFILE_ID, baseTxn, categoryByPath, defaultProfile, newAccount, newGoal, newRule, seedCategoryRows } from "./actions";
import { type Change, emptyTables, getData, uid, useStore } from "./store";

const up = (table: Change["table"], row: object): Change => ({ table, op: "upsert", row: row as Record<string, unknown> });

export interface OnboardingInput {
  name: string;
  pinHash: string | null;
  salary: number;
  cycleMode: CycleSetting["mode"];
  startDay: number;
  salaryDay: number;
  banks: { name: string; balance: number; upi: string }[];
  cash: number;
  card: null | {
    name: string; last4: string; limit: number; statementDay: number; dueMode: "fixed" | "after_statement";
    dueDay: number; graceDays: number; unbilled: number; rupayUpi: boolean; annualFee: number; waiver: number | null;
  };
  rent: null | { amount: number; dueDay: number; landlord: string; deposit: number };
  bills: { name: string; amount: number; dueDay: number; variable: boolean; path: string; kind: "bill" | "subscription" }[];
  budgets: { path: string; amount: number }[];
}

export function completeOnboarding(i: OnboardingInput) {
  const today = istDate();
  const existing = getData();
  const cats = existing.categories.length ? existing.categories : seedCategoryRows();
  const changes: Change[] = existing.categories.length ? [] : cats.map((c) => up("categories", c));
  const cat = (p: string) => categoryByPath(p, cats)?.id ?? null;

  const accounts: Account[] = [];
  i.banks.forEach((b, idx) => {
    const a = newAccount({ name: b.name, type: "savings", opening_balance: b.balance, is_default: idx === 0, color: idx === 0 ? "#2563eb" : "#0891b2" });
    accounts.push(a);
    changes.push(up("accounts", a));
    if (b.upi) changes.push(up("upi_handles", { id: uid(), account_id: a.id, handle: b.upi.trim() }));
  });
  const bank = accounts[0];
  const cash = newAccount({ name: "Cash", type: "cash", opening_balance: i.cash, color: "#16a34a" });
  changes.push(up("accounts", cash));

  if (i.card) {
    const ca = newAccount({ name: i.card.name, type: "credit_card", color: "#ea580c" });
    const card: CreditCard = {
      account_id: ca.id, bank: i.card.name.split(" ").slice(0, 3).join(" "), last4: i.card.last4, credit_limit: i.card.limit,
      statement_day: i.card.statementDay, due_mode: i.card.dueMode, due_day: i.card.dueDay, grace_days: i.card.graceDays, min_due_pct: 5,
      annual_fee: i.card.annualFee, fee_waiver_spend: i.card.waiver, fee_anniversary: today, reward_rules: [{ match: "*", rate: 1 }],
      points_redeemed: 0, points_expiry_months: 24, is_rupay_upi: i.card.rupayUpi,
    };
    changes.push(up("accounts", ca), up("credit_cards", card));
    // Current unbilled amount: on the card ledger and statement, but not this month's budget.
    if (i.card.unbilled > 0)
      changes.push(up("transactions", baseTxn({ amount: i.card.unbilled, account_id: ca.id, method: "card", merchant: "Opening unbilled", note: "Unbilled amount at setup", exclude_from_budget: true, occurred_at: dateToTs(today, "00:05") })));
  }

  // Salary as a recurring income (confirm the amount when it lands).
  changes.push(up("recurring_rules", newRule({
    name: "Salary", kind: "salary", txn_type: "income", amount: i.salary, due_day: i.salaryDay, account_id: bank?.id ?? null,
    method: "netbanking", category_id: cat("Income › Salary"), auto_post: false, start_date: addDays(today, 1),
  })));
  if (i.rent)
    changes.push(up("recurring_rules", newRule({
      name: "Rent", kind: "rent", amount: i.rent.amount, due_day: i.rent.dueDay, account_id: bank?.id ?? null, method: "upi",
      category_id: cat("Housing › Rent"), landlord: i.rent.landlord || null, deposit: i.rent.deposit, start_date: today,
    })));
  for (const b of i.bills) {
    changes.push(up("recurring_rules", newRule({
      name: b.name, kind: b.kind, amount: b.amount, amount_min: b.variable ? Math.round(b.amount * 0.7) : null,
      amount_max: b.variable ? Math.round(b.amount * 1.3) : null, due_day: b.dueDay, account_id: bank?.id ?? null,
      method: b.kind === "subscription" ? "card" : "upi", category_id: cat(b.path), start_date: today, auto_post: b.kind === "subscription",
    })));
  }
  for (const b of i.budgets) {
    const id = cat(b.path);
    if (id && b.amount > 0) changes.push(up("budget_lines", { id: uid(), category_id: id, amount: b.amount, rollover: false }));
  }

  changes.push(up("goals", newGoal({ name: "Emergency fund", kind: "emergency", target: Math.round(i.salary * 0.6 * 6), emoji: "🛟" })));
  for (const [label, text, emoji] of [["Metro", "40 metro upi", "🚇"], ["Chai", "20 chai upi", "☕"], ["Fuel", "500 petrol upi", "⛽"]])
    changes.push(up("templates", { id: uid(), label, text, emoji }));

  const profile: Profile = {
    ...defaultProfile(),
    ...existing.profiles[0],
    id: PROFILE_ID,
    name: i.name || "Deep",
    salary: i.salary,
    pin_hash: i.pinHash,
    cycle_history: [{ effective_from: "2000-01-01", mode: i.cycleMode, start_day: i.cycleMode === "calendar" ? 1 : i.startDay }],
    default_account_id: bank?.id ?? null,
    my_upi_id: i.banks[0]?.upi || null,
    onboarded: true,
  };
  changes.push(up("profiles", profile));
  useStore.getState().commit(changes);
}

export function suggestedBudgets(salary: number) {
  return SUGGESTED_SPLIT.map((s) => ({ path: s.path, amount: Math.round((salary * s.pct) / 100 / 100) * 100 }));
}

/** Two months of realistic sample data for trying the app. */
export function loadDemo() {
  const today = istDate();
  const base: Tables = emptyTables();
  const cats = seedCategoryRows();
  base.categories = cats;
  const cat = (p: string) => categoryByPath(p, cats)?.id ?? null;
  const start = addDays(today, -70);

  const bank = newAccount({ name: "Bank of India Savings", type: "savings", opening_balance: 62000, opening_date: start, is_default: true, color: "#2563eb" });
  const cash = newAccount({ name: "Cash", type: "cash", opening_balance: 2500, opening_date: start, color: "#16a34a" });
  const cardAcc = newAccount({ name: "BOI RuPay Credit Card", type: "credit_card", opening_date: start, color: "#ea580c" });
  const demat = newAccount({ name: "Zerodha Demat", type: "demat", opening_date: start, color: "#10b981" });
  base.accounts = [bank, cash, cardAcc, demat];
  base.upi_handles = [{ id: uid(), account_id: bank.id, handle: "deep@boi" }];
  base.credit_cards = [{
    account_id: cardAcc.id, bank: "Bank of India", last4: "4821", credit_limit: 150000, statement_day: 15, due_mode: "after_statement",
    due_day: 5, grace_days: 20, min_due_pct: 5, annual_fee: 999, fee_waiver_spend: 100000, fee_anniversary: addDays(today, -200),
    reward_rules: [{ match: "swiggy", rate: 5 }, { match: "amazon", rate: 3 }, { match: "*", rate: 1 }], points_redeemed: 0, points_expiry_months: 24, is_rupay_upi: true,
  }];

  const friends = [
    { id: uid(), name: "Rahul", upi_id: "rahul@okicici", phone: "9876543210", color: "#f97316", archived: false },
    { id: uid(), name: "Amit", upi_id: "amit@ybl", phone: "9876501234", color: "#22c55e", archived: false },
    { id: uid(), name: "Neha", upi_id: "neha@paytm", phone: null, color: "#a855f7", archived: false },
  ];
  base.friends = friends;
  const gid = uid();
  base.friend_groups = [{ id: gid, name: "Weekend Gang", emoji: "🍻" }];
  base.group_members = friends.map((f) => ({ id: uid(), group_id: gid, friend_id: f.id }));

  const salaryRule = newRule({ name: "Salary", kind: "salary", txn_type: "income", amount: 85000, due_day: 1, account_id: bank.id, method: "netbanking", category_id: cat("Income › Salary"), start_date: start, auto_post: false });
  const rent = newRule({ name: "Rent", kind: "rent", amount: 18000, due_day: 5, account_id: bank.id, category_id: cat("Housing › Rent"), landlord: "Mr. Kulkarni", deposit: 36000, start_date: start, escalation_pct: 5, property_address: "Flat 302, Green Park, Pune" });
  const elec = newRule({ name: "Electricity", kind: "bill", amount: 1400, amount_min: 900, amount_max: 2000, due_day: 18, account_id: bank.id, category_id: cat("Bills & Utilities › Electricity"), start_date: start });
  const net = newRule({ name: "Airtel Broadband", kind: "bill", amount: 799, due_day: 10, account_id: bank.id, category_id: cat("Bills & Utilities › Internet"), start_date: start, auto_post: true });
  const netflix = newRule({ name: "Netflix", kind: "subscription", amount: 499, due_day: 22, account_id: cardAcc.id, method: "card", category_id: cat("Bills & Utilities › Subscriptions"), start_date: start, auto_post: true, last_used_note: "Watched last week" });
  const sip = newRule({ name: "Nifty 50 SIP", kind: "sip", txn_type: "transfer", amount: 5000, due_day: 7, account_id: bank.id, to_account_id: demat.id, method: "auto_debit", category_id: cat("Investments › SIP"), start_date: start, auto_post: true });
  base.recurring_rules = [salaryRule, rent, elec, net, netflix, sip];

  const tx: Transaction[] = [];
  const add = (p: Partial<Transaction> & { date: string; time?: string }) => {
    const { date, time, ...rest } = p;
    const t = baseTxn({ ...rest, occurred_at: dateToTs(date, time ?? "13:00") });
    tx.push(t);
    return t;
  };
  // Monthly fixed items
  for (let m = 0; m < 3; m++) {
    const monthStart = toMonthStart(addDays(today, -m * 30));
    if (monthStart < start || monthStart > today) continue;
    add({ type: "income", amount: 85000, account_id: bank.id, method: "netbanking", category_id: cat("Income › Salary"), merchant: "Acme Technologies", is_salary: true, recurring_rule_id: salaryRule.id, date: monthStart, time: "09:00" });
    const d5 = addDays(monthStart, 4);
    if (d5 <= today) add({ amount: 18000, account_id: bank.id, category_id: cat("Housing › Rent"), merchant: "Mr. Kulkarni", recurring_rule_id: rent.id, date: d5 });
    const d7 = addDays(monthStart, 6);
    if (d7 <= today) add({ type: "transfer", amount: 5000, account_id: bank.id, to_account_id: demat.id, method: "auto_debit", category_id: cat("Investments › SIP"), merchant: "Nifty 50 SIP", recurring_rule_id: sip.id, date: d7 });
    const d10 = addDays(monthStart, 9);
    if (d10 <= today) add({ amount: 799, account_id: bank.id, category_id: cat("Bills & Utilities › Internet"), merchant: "Airtel Broadband", recurring_rule_id: net.id, date: d10 });
    const d18 = addDays(monthStart, 17);
    if (d18 <= today) add({ amount: 1100 + m * 230, account_id: bank.id, category_id: cat("Bills & Utilities › Electricity"), merchant: "MSEDCL", recurring_rule_id: elec.id, date: d18 });
    const d22 = addDays(monthStart, 21);
    if (d22 <= today) add({ amount: 499, account_id: cardAcc.id, method: "card", category_id: cat("Bills & Utilities › Subscriptions"), merchant: "Netflix", recurring_rule_id: netflix.id, date: d22 });
  }
  // Daily life
  const daily: [string, number, string, "upi" | "card" | "cash", string][] = [
    ["Swiggy", 420, "Food › Delivery", "card", "21:10"], ["Chai Point", 40, "Food › Tea & snacks", "upi", "16:30"],
    ["Metro", 40, "Transport › Metro", "upi", "09:10"], ["Uber", 260, "Transport › Cab", "upi", "19:40"],
    ["Zepto", 640, "Food › Groceries", "upi", "11:20"], ["Amazon", 1299, "Shopping › Online", "card", "22:05"],
    ["Zomato", 380, "Food › Delivery", "card", "13:30"], ["Auto", 80, "Transport › Auto", "cash", "18:00"],
    ["Starbucks", 350, "Food › Dining out", "card", "17:00"], ["Petrol", 500, "Transport › Fuel", "upi", "10:00"],
  ];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let day = start; day <= today; day = addDays(day, 1)) {
    const n = Math.floor(rnd() * 3) + 1;
    for (let k = 0; k < n; k++) {
      const [merchant, amt, path, method, time] = daily[Math.floor(rnd() * daily.length)];
      add({
        amount: Math.round(amt * (0.7 + rnd() * 0.6)), account_id: method === "card" ? cardAcc.id : method === "cash" ? cash.id : bank.id,
        method, category_id: cat(path), merchant, date: day, time,
      });
    }
  }
  // Card bill payment for the last statement
  // Pay every statement except the latest one in full, a few days after it closed.
  const lastEnd = addDays(cardCycleFor(today, 15).start, -1);
  const olderEnd = addDays(cardCycleFor(lastEnd, 15).start, -1);
  const billed = tx.filter((t) => t.account_id === cardAcc.id && t.type === "expense" && istDate(t.occurred_at) <= olderEnd).reduce((a, t) => a + t.amount, 0);
  if (billed > 0) add({ type: "card_payment", amount: billed, account_id: bank.id, to_account_id: cardAcc.id, method: "netbanking", merchant: "Card bill", date: addDays(olderEnd, 12) });

  // Shared expenses (flow F6)
  const [rahul, amit, neha] = friends;
  const splitTxn = (amount: number, payer: string | null, people: (string | null)[], merchant: string, path: string, date: string) => {
    const shares = computeSplit(amount, "equal", people.map((p) => ({ friend_id: p })), payer);
    const t = add({ amount, account_id: payer ? null : bank.id, paid_by_friend_id: payer, my_share: shares.find((s) => s.friend_id === null)!.share, split_mode: "equal", group_id: gid, category_id: cat(path), merchant, date, time: "21:30" });
    for (const s of shares) base.transaction_splits.push({ id: uid(), transaction_id: t.id, friend_id: s.friend_id, share: s.share });
  };
  splitTxn(3600, rahul.id, [null, rahul.id, amit.id], "Barbeque Nation", "Food › Dining out", addDays(today, -9));
  splitTxn(2700, null, [null, rahul.id, amit.id], "PVR Cinemas", "Entertainment › Movies", addDays(today, -4));
  splitTxn(1800, null, [null, neha.id], "Toit Brewpub", "Entertainment › Drinks", addDays(today, -40));
  base.settlements = [{ id: uid(), friend_id: neha.id, direction: "received", amount: 500, date: addDays(today, -30), account_id: bank.id, note: "Partial" }];

  // IPOs: one sold, one awaiting allotment
  const ipo1 = uid(), ipo2 = uid();
  base.ipo_applications = [
    { id: ipo1, company: "Bharat Mobility", category: "retail", applicant: "self", lots: 1, lot_size: 100, price_band_low: 140, price_band_high: 148, bid_price: 148, issue_price: 148, account_id: bank.id, applied_date: addDays(today, -35), mandate_date: addDays(today, -33), allotment_date: addDays(today, -31), listing_date: addDays(today, -29), status: "sold", shares_allotted: 100, listing_price: 182, sell_price: 179, shares_sold: 100, sold_date: addDays(today, -29), realised_pnl: 3100, refund_received: false },
    { id: ipo2, company: "Sunrise Renewables", category: "retail", applicant: "self", lots: 1, lot_size: 50, price_band_low: 285, price_band_high: 300, bid_price: 300, issue_price: null, account_id: bank.id, applied_date: addDays(today, -1), mandate_date: addDays(today, 1), allotment_date: addDays(today, 2), listing_date: addDays(today, 4), status: "blocked", shares_allotted: 0, listing_price: null, sell_price: null, shares_sold: 0, sold_date: null, realised_pnl: null, refund_received: false },
  ];
  add({ type: "transfer", amount: 14800, account_id: bank.id, to_account_id: demat.id, method: "netbanking", merchant: "Bharat Mobility IPO", ipo_application_id: ipo1, category_id: cat("Investments › IPO"), date: addDays(today, -31) });
  add({ type: "transfer", amount: 17900, account_id: demat.id, to_account_id: bank.id, method: "netbanking", merchant: "Bharat Mobility sale", ipo_application_id: ipo1, date: addDays(today, -29) });
  base.holds = [{ id: uid(), account_id: bank.id, amount: 15000, reason: "ipo", ipo_application_id: ipo2, status: "active", created_at: new Date().toISOString(), released_at: null }];
  base.holdings = [{ id: uid(), name: "Nifty 50 Index Fund", symbol: "NIFTYBEES", kind: "mf", quantity: 52.4, avg_cost: 270, current_price: 283, account_id: demat.id, ipo_application_id: null, buy_date: start, as_of: today }];

  base.transactions = tx;
  base.budget_lines = [
    ["Food", 9000], ["Transport", 3500], ["Shopping", 5000], ["Entertainment", 3000], ["Bills & Utilities", 3500],
  ].map(([p, a]) => ({ id: uid(), category_id: cat(p as string)!, amount: a as number, rollover: p === "Food" }));
  base.goals = [
    newGoal({ name: "Goa trip", target: 30000, target_date: addDays(today, 100), emoji: "🏖️", roundup_to: 10 }),
    newGoal({ name: "Emergency fund", kind: "emergency", target: 300000, emoji: "🛟" }),
  ];
  base.goal_contributions = [{ id: uid(), goal_id: base.goals[1].id, amount: 120000, date: start, source: "manual" }];
  base.templates = [
    { id: uid(), label: "Metro", text: "40 metro upi", emoji: "🚇" },
    { id: uid(), label: "Chai", text: "20 chai upi", emoji: "☕" },
    { id: uid(), label: "Fuel", text: "500 petrol upi", emoji: "⛽" },
  ];
  base.profiles = [{
    ...defaultProfile(), name: "Deep", salary: 85000, onboarded: true, default_account_id: bank.id, my_upi_id: "deep@boi",
    cycle_history: [{ effective_from: "2000-01-01", mode: "calendar", start_day: 1 }],
  }];

  // Write through commit so it also syncs when signed in.
  const changes: Change[] = [];
  for (const [table, rows] of Object.entries(base) as [keyof Tables, Record<string, unknown>[]][]) for (const r of rows) changes.push({ table, op: "upsert", row: r });
  useStore.getState().replaceAll(emptyTables());
  useStore.getState().commit(changes);
}

function toMonthStart(d: string) {
  return `${d.slice(0, 7)}-01`;
}
