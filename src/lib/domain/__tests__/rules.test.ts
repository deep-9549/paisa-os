import { describe, expect, it } from "vitest";
import type { Hold, IpoApplication, RecurringRule } from "../../types";
import { paceStatus, suggestBudget, typicalSpend } from "../budgets";
import { billEffect, computeSplit, friendBalances, simplifyDebts, upiPayLink } from "../friends";
import { goalReserve, plannedMonthly, roundUp } from "../goals";
import { blockedAmount, listingGainPct, realisedPnl, releaseOnAllotment, taxEstimate } from "../ipo";
import { normalizeSpoken, parseQuickAdd } from "../parser";
import { detectRecurring, expectedAmount, occurrences } from "../recurring";
import { computeSafeToSpend } from "../safeToSpend";
import { parseBankSms } from "../sms";
import { acct, txn } from "./fixtures";

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: "r1", name: "Rent", kind: "rent", txn_type: "expense", amount: 15000, amount_min: null, amount_max: null,
  frequency: "monthly", interval_days: null, due_day: 5, start_date: "2026-01-01", end_date: null,
  account_id: null, to_account_id: null, method: "upi", category_id: null, auto_post: false, active: true,
  landlord: null, landlord_pan: null, property_address: null, escalation_pct: 0, deposit: 0, last_used_note: null, tags: [],
  ...over,
});

describe("friends ledger", () => {
  it("equal split: rounding paise go to the payer", () => {
    const s = computeSplit(100, "equal", [{ friend_id: null }, { friend_id: "a" }, { friend_id: "b" }], "a");
    expect(s.map((x) => x.share)).toEqual([33.33, 33.34, 33.33]);
    expect(s.reduce((a, b) => a + b.share, 0)).toBeCloseTo(100, 2);
  });
  it("exact split must sum to the bill", () => {
    expect(() => computeSplit(100, "exact", [{ friend_id: null, value: 40 }, { friend_id: "a", value: 50 }], null)).toThrow();
    expect(computeSplit(100, "exact", [{ friend_id: null, value: 40 }, { friend_id: "a", value: 60 }], null)[1].share).toBe(60);
  });
  it("percent and shares", () => {
    expect(computeSplit(1000, "percent", [{ friend_id: null, value: 25 }, { friend_id: "a", value: 75 }], null).map((s) => s.share)).toEqual([250, 750]);
    expect(computeSplit(900, "shares", [{ friend_id: null, value: 1 }, { friend_id: "a", value: 2 }], null).map((s) => s.share)).toEqual([300, 600]);
  });
  it("itemised spreads tax/tip in proportion", () => {
    const s = computeSplit(1100, "itemised", [{ friend_id: null, value: 400 }, { friend_id: "a", value: 600 }], null);
    expect(s.map((x) => x.share)).toEqual([440, 660]);
  });

  it("flow F6: dinner paid by Rahul, movie paid by me → I owe Rahul ₹300", () => {
    const dinner = txn({ amount: 3600, my_share: 1200, paid_by_friend_id: "rahul" });
    const movie = txn({ amount: 2700, my_share: 900, account_id: "bank" });
    const splits = [
      { id: "1", transaction_id: dinner.id, friend_id: null, share: 1200 },
      { id: "2", transaction_id: dinner.id, friend_id: "rahul", share: 1200 },
      { id: "3", transaction_id: dinner.id, friend_id: "amit", share: 1200 },
      { id: "4", transaction_id: movie.id, friend_id: null, share: 900 },
      { id: "5", transaction_id: movie.id, friend_id: "rahul", share: 900 },
      { id: "6", transaction_id: movie.id, friend_id: "amit", share: 900 },
    ];
    const bal = friendBalances([dinner, movie], splits, []);
    expect(bal.get("rahul")).toBe(-300);
    expect(bal.get("amit")).toBe(900);
    const after = friendBalances([dinner, movie], splits, [
      { id: "s", friend_id: "rahul", direction: "paid", amount: 300, date: "2026-10-12", account_id: null, note: null },
    ]);
    expect(after.get("rahul")).toBe(0);
  });
  it("multi-payer bills allocate pairwise in proportion", () => {
    const t = txn({ amount: 3000, payers: [{ friend_id: null, amount: 2000 }, { friend_id: "a", amount: 1000 }] });
    const eff = billEffect(t, [
      { id: "1", transaction_id: t.id, friend_id: null, share: 1000 },
      { id: "2", transaction_id: t.id, friend_id: "a", share: 1000 },
      { id: "3", transaction_id: t.id, friend_id: "b", share: 1000 },
    ]);
    expect(eff.get("b")).toBe(1000);
    expect(eff.has("a")).toBe(false);
  });
  it("simplify debts: greedy fewest transfers", () => {
    const t = simplifyDebts(new Map([["me", 500], ["a", -300], ["b", -200], ["c", 0]]));
    expect(t).toEqual([{ from: "a", to: "me", amount: 300 }, { from: "b", to: "me", amount: 200 }]);
    const t2 = simplifyDebts(new Map([["a", 100], ["b", -50], ["c", -50], ["d", 0]]));
    expect(t2).toHaveLength(2);
  });
  it("UPI deep link", () => {
    expect(upiPayLink("rahul@okicici", "Rahul", 300, "Paisa OS settle")).toBe(
      "upi://pay?pa=rahul%40okicici&pn=Rahul&am=300.00&tn=Paisa+OS+settle&cu=INR",
    );
  });
});

describe("IPO rules", () => {
  const app: IpoApplication = {
    id: "i", company: "Acme", category: "retail", applicant: "self", lots: 2, lot_size: 50, price_band_low: 140,
    price_band_high: 150, bid_price: 150, issue_price: null, account_id: "bank", applied_date: "2026-10-01",
    mandate_date: null, allotment_date: "2026-10-06", listing_date: "2026-10-08", status: "blocked",
    shares_allotted: 0, listing_price: null, sell_price: null, shares_sold: 0, sold_date: null, realised_pnl: null, refund_received: false,
  };
  it("blocked = lots × lot size × bid price", () => expect(blockedAmount(2, 50, 150)).toBe(15000));
  it("partial allotment releases (applied − allotted) × bid price", () => {
    expect(releaseOnAllotment(app, 50)).toEqual({ release: 7500, invested: 7500 });
    expect(releaseOnAllotment(app, 0)).toEqual({ release: 15000, invested: 0 });
  });
  it("listing gain and P&L, STCG under 12 months", () => {
    const sold = { ...app, listing_price: 180, sell_price: 175, shares_sold: 50, sold_date: "2026-10-08" };
    expect(listingGainPct(sold)).toBeCloseTo(0.2);
    expect(realisedPnl(sold)).toBe(1250);
    expect(taxEstimate(sold, 20, 12.5)).toEqual({ kind: "STCG", gain: 1250, tax: 250 });
  });
});

describe("recurring", () => {
  it("monthly occurrences clamp to month end", () => {
    expect(occurrences(rule({ due_day: 31 }), "2026-01-01", "2026-03-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
  it("quarterly and yearly", () => {
    expect(occurrences(rule({ frequency: "quarterly", due_day: 10 }), "2026-01-01", "2026-12-31")).toEqual(["2026-01-10", "2026-04-10", "2026-07-10", "2026-10-10"]);
    expect(occurrences(rule({ frequency: "yearly", due_day: 10, start_date: "2025-03-01" }), "2026-01-01", "2026-12-31")).toEqual(["2026-03-10"]);
  });
  it("rent escalation and variable 3-month average", () => {
    expect(expectedAmount(rule({ escalation_pct: 10, start_date: "2025-01-01" }), "2026-02-05", [])).toBe(16500);
    const v = rule({ id: "v", amount_min: 800, amount_max: 1600 });
    expect(expectedAmount(v, "2026-10-05", [])).toBe(1200);
    const posted = [900, 1000, 1400].map((a, i) => txn({ amount: a, recurring_rule_id: "v", date: `2026-0${7 + i}-05` }));
    expect(expectedAmount(v, "2026-10-05", posted)).toBe(1100);
  });
});

describe("Safe-to-Spend", () => {
  const bank = acct({ opening_balance: 50000, opening_date: "2026-09-01" });
  const cc = acct({ type: "credit_card", opening_date: "2026-09-01" });
  const demat = acct({ type: "demat", opening_date: "2026-09-01" });
  const cycle = { start: "2026-10-01", end: "2026-10-31", length: 31 };
  const base = {
    profile: { salary: 80000, buffer_pct: 5 },
    cycle,
    today: "2026-10-19",
    accounts: [bank, cc, demat],
    settlements: [],
    goals: [],
    contributions: [],
  };

  it("combines income, commitments, buffer, UPI+card spend and IPO holds", () => {
    const salary = txn({ type: "income", amount: 80000, account_id: bank.id, is_salary: true, date: "2026-10-01" });
    const upi = txn({ amount: 2000, account_id: bank.id, date: "2026-10-05" });
    const swipe = txn({ amount: 3000, account_id: cc.id, method: "card", date: "2026-10-06" });
    const billPay = txn({ type: "card_payment", amount: 5000, account_id: bank.id, to_account_id: cc.id, date: "2026-10-07" });
    const today = txn({ amount: 500, account_id: bank.id, date: "2026-10-19" });
    const hold: Hold = { id: "h", account_id: bank.id, amount: 15000, reason: "ipo", ipo_application_id: "i", status: "active", created_at: "", released_at: null };
    const rent = rule({ due_day: 25 }); // unposted, due in cycle
    const r = computeSafeToSpend({
      ...base,
      transactions: [salary, upi, swipe, billPay, today],
      rules: [rent],
      holds: [hold],
    });
    expect(r.income).toBe(80000);
    expect(r.expectedSalary).toBe(0);
    expect(r.fixedCommitments).toBe(15000);
    expect(r.buffer).toBe(4000);
    expect(r.spent).toBe(5500); // bill payment not counted again
    expect(r.holds).toBe(15000);
    expect(r.month).toBe(80000 - 15000 - 4000 - 5500 - 15000);
    expect(r.daysLeft).toBe(13);
    expect(r.dailyAllowance).toBeCloseTo((40500 + 500) / 13, 2);
    expect(r.todayLeft).toBeCloseTo(41000 / 13 - 500, 2);
    // True cash: bank − card outstanding − holds
    expect(r.liquid).toBe(50000 + 80000 - 2000 - 5000 - 500);
    expect(r.cardOutstanding).toBe(0);
    expect(r.trueCash).toBe(r.liquid - 15000);
  });
  it("uses expected salary before it lands; SIP counts as commitment not spend", () => {
    const sip = txn({ type: "transfer", amount: 5000, account_id: bank.id, to_account_id: demat.id, date: "2026-10-10" });
    const r = computeSafeToSpend({ ...base, transactions: [sip], rules: [], holds: [] });
    expect(r.income).toBe(80000);
    expect(r.expectedSalary).toBe(80000);
    expect(r.investments).toBe(5000);
    expect(r.spent).toBe(0);
  });
  it("caps at real cash until salary is recorded (mid-month setup)", () => {
    const poor = acct({ opening_balance: 20000, opening_date: "2026-10-19" });
    const rent = rule({ due_day: 25 });
    const r = computeSafeToSpend({ ...base, accounts: [poor], transactions: [], rules: [rent], holds: [] });
    expect(r.expectedSalary).toBe(80000);
    expect(r.cappedByCash).toBe(true);
    expect(r.month).toBe(20000 - 15000);
    const savings = acct({ opening_balance: 200000, opening_date: "2026-09-01" });
    const rich = computeSafeToSpend({ ...base, accounts: [savings], transactions: [], rules: [rent], holds: [] });
    expect(rich.cappedByCash).toBe(false);
    expect(rich.month).toBe(80000 - 15000 - 4000);
  });
  it("daily allowance never shown below zero", () => {
    const big = txn({ amount: 200000, account_id: bank.id, date: "2026-10-19" });
    const r = computeSafeToSpend({ ...base, transactions: [big], rules: [], holds: [] });
    expect(r.todayLeft).toBe(0);
    expect(r.todayOverBy).toBeGreaterThan(0);
  });
  it("friend receivables are excluded", () => {
    const paidForFriends = txn({ amount: 3000, my_share: 1000, account_id: bank.id, date: "2026-10-10" });
    const r = computeSafeToSpend({ ...base, transactions: [paidForFriends], rules: [], holds: [] });
    expect(r.spent).toBe(1000);
  });
});

describe("goals", () => {
  const cycle = { start: "2026-10-01", end: "2026-10-31", length: 31 };
  const goal = { id: "g", name: "Trip", kind: "goal" as const, target: 30000, target_date: "2026-12-31", account_id: null, emoji: "", roundup_to: 0, archived: false, created_at: "" };
  it("monthly contribution spreads the gap over remaining cycles", () => {
    expect(plannedMonthly(goal, [], cycle)).toBe(10000);
    expect(goalReserve([goal], [{ id: "c", goal_id: "g", amount: 12000, date: "2026-10-05", source: "manual" }], cycle)).toBe(12000);
  });
  it("round-ups", () => {
    expect(roundUp(183, 10)).toBe(7);
    expect(roundUp(180, 10)).toBe(0);
    expect(roundUp(183, 50)).toBe(17);
  });
});

describe("budget pace", () => {
  it("62% spent with 40% gone → over pace (amber)", () => {
    expect(paceStatus(620, 1000, 0.4)).toMatchObject({ status: "warn", overPace: true });
    expect(paceStatus(300, 1000, 0.4)).toMatchObject({ status: "ok" });
    expect(paceStatus(850, 1000, 0.9)).toMatchObject({ status: "warn" });
    expect(paceStatus(1100, 1000, 0.9)).toMatchObject({ status: "over" });
  });
});

describe("quick-add parser", () => {
  const ctx = { friendNames: ["Rahul Sharma", "Amit"] };
  it("450 swiggy card", () => {
    expect(parseQuickAdd("450 swiggy card", ctx)).toMatchObject({ amount: 450, method: "card", forceCard: true, merchant: "Swiggy", categoryPath: "Food › Delivery" });
  });
  it("180 chai upi", () => {
    expect(parseQuickAdd("180 chai upi", ctx)).toMatchObject({ amount: 180, method: "upi", categoryPath: "Food › Tea & snacks" });
  });
  it("1200 dinner upi split rahul amit", () => {
    expect(parseQuickAdd("1200 dinner upi split rahul amit", ctx)).toMatchObject({ amount: 1200, method: "upi", splitWith: ["Rahul Sharma", "Amit"], categoryPath: "Food › Dining out" });
  });
  it("paid by a friend", () => {
    expect(parseQuickAdd("3600 dinner paid by rahul split amit", ctx)).toMatchObject({ paidBy: "Rahul Sharma", splitWith: ["Rahul Sharma", "Amit"] });
  });
  it("income, tags, yesterday", () => {
    expect(parseQuickAdd("80000 salary", ctx)).toMatchObject({ type: "income", categoryPath: "Income › Salary" });
    expect(parseQuickAdd("yesterday 80 auto cash #office", ctx)).toMatchObject({ amount: 80, daysAgo: 1, method: "cash", tags: ["office"], categoryPath: "Transport › Auto" });
  });
});

describe("bank SMS parser", () => {
  it("Bank of India UPI debit", () => {
    const d = parseBankSms("Rs.450.00 debited from A/c XX1234 on 19-10-26 to VPA swiggy@icici UPI Ref No 629312345678. -Bank of India");
    expect(d).toMatchObject({ amount: 450, direction: "debit", method: "upi", last4: "1234", merchant: "Swiggy", date: "2026-10-19", bank: "Bank of India" });
  });
  it("BOI RuPay credit card spend", () => {
    const d = parseBankSms("INR 2,400.00 spent on BOI RuPay Credit Card XX5678 at AMAZON on 19/10/2026. Avl Lmt INR 97,600.00");
    expect(d).toMatchObject({ amount: 2400, direction: "debit", method: "card", isCard: true, last4: "5678", merchant: "Amazon" });
  });
  it("salary credit", () => {
    const d = parseBankSms("Your A/c XX1234 is credited with Rs.80,000.00 on 01-10-2026 by NEFT from ACME TECHNOLOGIES. Avl Bal Rs.95,000");
    expect(d).toMatchObject({ amount: 80000, direction: "credit", method: "netbanking" });
  });
});

describe("recurring detection", () => {
  it("finds an untracked monthly subscription", () => {
    const mk = (date: string, amount = 649, merchant = "Spotify") => txn({ date, amount, merchant });
    const txns = [mk("2026-07-05"), mk("2026-08-05"), mk("2026-09-05"), mk("2026-10-05"), mk("2026-10-01", 120, "Chai"), mk("2026-10-02", 900, "Chai"), mk("2026-10-09", 40, "Chai")];
    const c = detectRecurring(txns, [], "2026-10-19");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ merchant: "Spotify", frequency: "monthly", dueDay: 5, amount: 649, kind: "subscription" });
  });
  it("ignores ones already tracked or stopped", () => {
    const mk = (date: string) => txn({ date, amount: 199, merchant: "Netflix" });
    const txns = [mk("2026-04-05"), mk("2026-05-05"), mk("2026-06-05")];
    expect(detectRecurring(txns, [], "2026-10-19")).toHaveLength(0);
    const live = [mk("2026-08-05"), mk("2026-09-05"), mk("2026-10-05")];
    expect(detectRecurring(live, [{ name: "Netflix" } as never], "2026-10-19")).toHaveLength(0);
  });
});

describe("budget suggestions", () => {
  const cats = [
    { id: "food", name: "Food", parent_id: null, icon: "", color: "", kind: "expense" as const },
    { id: "deliv", name: "Delivery", parent_id: "food", icon: "", color: "", kind: "expense" as const },
  ];
  const cycles = [
    { start: "2026-07-01", end: "2026-07-31", length: 31 },
    { start: "2026-08-01", end: "2026-08-31", length: 31 },
    { start: "2026-09-01", end: "2026-09-30", length: 30 },
  ];
  it("averages only months with data and rolls children up", () => {
    const t = typicalSpend([txn({ date: "2026-08-03", amount: 3000, category_id: "deliv" }), txn({ date: "2026-09-03", amount: 5000, category_id: "food" })], cats, cycles);
    expect(t.get("food")).toBe(4000);
    expect(t.get("deliv")).toBe(1500);
  });
  it("rounds suggestions up to friendly numbers", () => {
    expect(suggestBudget(4012)).toBe(4100);
    expect(suggestBudget(7210)).toBe(7500);
    expect(suggestBudget(0)).toBe(0);
  });
});

describe("voice quick-add", () => {
  it("normalises spoken amounts", () => {
    expect(normalizeSpoken("450 rupees Swiggy on card")).toBe("450 swiggy on card");
    expect(normalizeSpoken("2 thousand rent")).toBe("2000 rent");
    expect(normalizeSpoken("1.5 lakh bonus income")).toBe("150000 bonus income");
    expect(normalizeSpoken("₹1,200 dinner split Rahul")).toBe("1200 dinner split rahul");
    expect(normalizeSpoken("two hundred auto cash")).toBe("200 auto cash");
  });
  it("feeds the normal parser", () => {
    const p = parseQuickAdd(normalizeSpoken("Rs 80 chai yesterday"));
    expect(p).toMatchObject({ amount: 80, daysAgo: 1, categoryPath: "Food › Tea & snacks" });
  });
});
