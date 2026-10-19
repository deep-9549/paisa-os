import { describe, expect, it } from "vitest";
import { cardCycleFor, dueDateFor, emiSchedule, minimumDue, rewardRate, statementStatus, summariseCard, feeWaiverProgress } from "../cards";
import { changeCycleSetting, getCycle } from "../cycle";
import { accountBalance, budgetImpact, findDuplicate, isSalaryIncome, spendInRange } from "../ledger";
import { formatINR, groupTyping, parseAmount } from "../money";
import { acct, card, txn } from "./fixtures";

describe("money", () => {
  it("formats Indian grouping", () => {
    expect(formatINR(123456)).toBe("₹1,23,456");
    expect(formatINR(1234567.5)).toBe("₹12,34,567.50");
    expect(formatINR(999)).toBe("₹999");
    expect(formatINR(-1200)).toBe("−₹1,200");
    expect(formatINR(250000, { compact: true })).toBe("₹2.5L");
  });
  it("parses amounts", () => {
    expect(parseAmount("1,23,456")).toBe(123456);
    expect(parseAmount("1.2k")).toBe(1200);
    expect(parseAmount("2L")).toBe(200000);
    expect(parseAmount("₹450.50")).toBe(450.5);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("120+80")).toBe(200);
    expect(parseAmount("1,200 + 1.5k")).toBe(2700);
    expect(parseAmount("120+x")).toBeNull();
  });
  it("groups digits while typing", () => {
    expect(groupTyping("120000")).toBe("1,20,000");
    expect(groupTyping("1,2000.567")).toBe("12,000.56");
    expect(groupTyping(".5")).toBe("0.5");
    expect(groupTyping("120+80")).toBe("120+80");
    expect(groupTyping("")).toBe("");
  });
});

describe("budget cycle", () => {
  const calendar = [{ effective_from: "2026-01-01", mode: "calendar" as const, start_day: 1 }];
  const day25 = [{ effective_from: "2026-01-01", mode: "custom" as const, start_day: 25 }];

  it("calendar month", () => {
    expect(getCycle("2026-10-19", calendar)).toMatchObject({ start: "2026-10-01", end: "2026-10-31", length: 31 });
  });
  it("custom start day 25 → 24", () => {
    expect(getCycle("2026-10-19", day25)).toMatchObject({ start: "2026-09-25", end: "2026-10-24" });
    expect(getCycle("2026-10-25", day25)).toMatchObject({ start: "2026-10-25", end: "2026-11-24" });
  });
  it("start day past month end falls back to last day", () => {
    const d31 = [{ effective_from: "2026-01-01", mode: "custom" as const, start_day: 31 }];
    expect(getCycle("2026-02-28", d31)).toMatchObject({ start: "2026-02-28", end: "2026-03-30" });
    expect(getCycle("2026-02-10", d31)).toMatchObject({ start: "2026-01-31", end: "2026-02-27" });
  });
  it("salary mode: early salary starts the cycle early", () => {
    const sal = [{ effective_from: "2026-01-01", mode: "salary" as const, start_day: 25 }];
    expect(getCycle("2026-10-23", sal, ["2026-09-25", "2026-10-23"])).toMatchObject({ start: "2026-10-23", end: "2026-11-24" });
    // Before the early salary the previous cycle ends the day before it.
    expect(getCycle("2026-10-10", sal, ["2026-09-25", "2026-10-23"])).toMatchObject({ start: "2026-09-25", end: "2026-10-22" });
  });
  it("salary mode: late salary keeps the previous cycle open", () => {
    const sal = [{ effective_from: "2026-01-01", mode: "salary" as const, start_day: 25 }];
    const c = getCycle("2026-10-26", sal, ["2026-09-25"]);
    expect(c.start).toBe("2026-09-25");
    expect(c.end >= "2026-10-26").toBe(true);
  });
  it("changing the setting never rewrites the running or past cycles", () => {
    const h = changeCycleSetting(calendar, "custom", 25, "2026-10-19");
    // Running calendar cycle is kept and runs until the new start date.
    expect(getCycle("2026-10-19", h)).toMatchObject({ start: "2026-10-01", end: "2026-10-24" });
    expect(getCycle("2026-09-10", h)).toMatchObject({ start: "2026-09-01", end: "2026-09-30" });
    expect(getCycle("2026-10-25", h)).toMatchObject({ start: "2026-10-25", end: "2026-11-24" });
  });
});

describe("ledger / budget impact (section 9 table)", () => {
  const bank = acct({ opening_balance: 10000 });
  const cc = acct({ type: "credit_card", name: "RuPay" });

  it("UPI expense: bank −amount, budget −my share", () => {
    const t = txn({ amount: 450, account_id: bank.id, method: "upi" });
    expect(accountBalance(bank, [t], [])).toBe(9550);
    expect(budgetImpact(t)).toBe(450);
  });
  it("card expense: card outstanding +amount, bank untouched, budget −amount", () => {
    const t = txn({ amount: 2400, account_id: cc.id, method: "card" });
    expect(accountBalance(cc, [t], [])).toBe(-2400);
    expect(accountBalance(bank, [t], [])).toBe(10000);
    expect(budgetImpact(t)).toBe(2400);
  });
  it("card bill payment: bank −, card −, budget unchanged", () => {
    const swipe = txn({ amount: 2400, account_id: cc.id, method: "card" });
    const pay = txn({ type: "card_payment", amount: 2400, account_id: bank.id, to_account_id: cc.id, method: "netbanking" });
    expect(accountBalance(bank, [swipe, pay], [])).toBe(7600);
    expect(accountBalance(cc, [swipe, pay], [])).toBe(0);
    expect(spendInRange([swipe, pay], "2026-10-01", "2026-10-31")).toBe(2400);
  });
  it("friend paid: no account touched, budget −my share", () => {
    const t = txn({ amount: 3600, my_share: 1200, paid_by_friend_id: "rahul", account_id: null });
    expect(accountBalance(bank, [t], [])).toBe(10000);
    expect(budgetImpact(t)).toBe(1200);
  });
  it("I paid for friends: bank −full, budget −my share", () => {
    const t = txn({ amount: 2700, my_share: 900, account_id: bank.id });
    expect(accountBalance(bank, [t], [])).toBe(7300);
    expect(budgetImpact(t)).toBe(900);
  });
  it("refund: + to account, + back to budget", () => {
    const e = txn({ amount: 1000, account_id: cc.id, method: "card" });
    const r = txn({ type: "refund", amount: 400, account_id: cc.id, refund_of: e.id });
    expect(accountBalance(cc, [e, r], [])).toBe(-600);
    expect(spendInRange([e, r], "2026-10-01", "2026-10-31")).toBe(600);
  });
  it("settlement received: + bank, budget unchanged", () => {
    expect(accountBalance(bank, [], [{ id: "s", friend_id: "f", direction: "received", amount: 300, date: "2026-10-10", account_id: bank.id, note: null }])).toBe(10300);
  });
  it("detects duplicates within 10 minutes", () => {
    const a = txn({ amount: 450, merchant: "Swiggy", occurred_at: "2026-10-10T10:00:00Z" });
    expect(findDuplicate({ id: "x", amount: 450, merchant: "swiggy", occurred_at: "2026-10-10T10:08:00Z" }, [a])).toBe(a);
    expect(findDuplicate({ id: "x", amount: 450, merchant: "swiggy", occurred_at: "2026-10-10T10:12:00Z" }, [a])).toBeUndefined();
  });
});

describe("card cycle rules", () => {
  it("swipe lands in the cycle ending on statement day", () => {
    expect(cardCycleFor("2026-10-10", 15)).toEqual({ start: "2026-09-16", end: "2026-10-15" });
    expect(cardCycleFor("2026-10-16", 15)).toEqual({ start: "2026-10-16", end: "2026-11-15" });
  });
  it("statement day beyond month length → last day of month", () => {
    expect(cardCycleFor("2026-02-20", 31)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(cardCycleFor("2026-03-05", 31)).toEqual({ start: "2026-03-01", end: "2026-03-31" });
  });
  it("due date: statement + grace days, or fixed due day", () => {
    expect(dueDateFor({ due_mode: "after_statement", due_day: 0, grace_days: 20 }, "2026-10-15")).toBe("2026-11-04");
    expect(dueDateFor({ due_mode: "fixed", due_day: 7, grace_days: 0 }, "2026-10-15")).toBe("2026-11-07");
    expect(dueDateFor({ due_mode: "fixed", due_day: 25, grace_days: 0 }, "2026-10-15")).toBe("2026-10-25");
  });
  it("minimum due = max(5%, ₹200), EMIs added in full, capped at total", () => {
    expect(minimumDue(18450)).toBe(922.5);
    expect(minimumDue(1000)).toBe(200);
    expect(minimumDue(150)).toBe(150);
    expect(minimumDue(10000, 5, 2000)).toBe(2400);
    expect(minimumDue(0)).toBe(0);
  });
  it("statement status", () => {
    const s = { total: 1000, min_due: 200, due_date: "2026-11-04" };
    expect(statementStatus({ ...s, paid: 1000 }, "2026-11-10")).toBe("paid");
    expect(statementStatus({ ...s, paid: 300 }, "2026-11-10")).toBe("partly_paid");
    expect(statementStatus({ ...s, paid: 100 }, "2026-11-01")).toBe("unpaid");
    expect(statementStatus({ ...s, paid: 100 }, "2026-11-05")).toBe("overdue");
  });
  it("payment allocation: oldest statement first, then the open cycle", () => {
    const bank = acct({ opening_balance: 100000 });
    const cc = acct({ type: "credit_card", opening_date: "2026-08-01" });
    const c = card(cc.id);
    const txns = [
      txn({ amount: 5000, account_id: cc.id, method: "card", date: "2026-08-20" }), // Sep 15 statement
      txn({ amount: 3000, account_id: cc.id, method: "card", date: "2026-09-20" }), // Oct 15 statement
      txn({ amount: 1000, account_id: cc.id, method: "card", date: "2026-10-17" }), // open
      txn({ type: "card_payment", amount: 6000, account_id: bank.id, to_account_id: cc.id, date: "2026-10-01" }),
    ];
    const s = summariseCard(c, cc, txns, [], [], [], "2026-10-19");
    expect(s.statements.map((x) => [x.end, x.total, x.paid, x.status])).toEqual([
      ["2026-08-15", 0, 0, "paid"],
      ["2026-09-15", 5000, 5000, "paid"],
      ["2026-10-15", 3000, 1000, "partly_paid"],
    ]);
    expect(s.unbilled).toBe(1000);
    expect(s.outstanding).toBe(3000);
    expect(s.billedDue).toBe(2000);
    expect(s.utilisation).toBeCloseTo(0.03);
  });
  it("EMI schedule sums principal exactly", () => {
    const sch = emiSchedule({ principal: 30000, tenure_months: 6, annual_rate: 15, gst_pct: 18, start_date: "2026-10-20" });
    expect(sch).toHaveLength(6);
    expect(sch.reduce((a, b) => a + b.principal, 0)).toBeCloseTo(30000, 2);
    expect(sch[0].interest).toBe(375);
    expect(sch[0].gst).toBe(67.5);
  });
  it("reward rule match", () => {
    const rules = [{ match: "swiggy", rate: 5 }, { match: "*", rate: 1 }];
    expect(rewardRate(rules, "Swiggy Instamart")).toBe(5);
    expect(rewardRate(rules, "Amazon")).toBe(1);
  });
  it("fee waiver progress", () => {
    const cc = acct({ type: "credit_card" });
    const c = card(cc.id, { fee_waiver_spend: 50000, fee_anniversary: "2026-03-15" });
    const p = feeWaiverProgress(c, [txn({ amount: 12000, account_id: cc.id, date: "2026-05-01" })], "2026-10-19");
    expect(p).toMatchObject({ spent: 12000, remaining: 38000, deadline: "2027-03-14" });
  });
});

describe("salary detection", () => {
  const cats = [
    { id: "sal", name: "Salary", kind: "income" },
    { id: "free", name: "Freelance", kind: "income" },
    { id: "x", name: "Salary", kind: "expense" },
  ];
  it("flags income in the Salary category only", () => {
    expect(isSalaryIncome({ type: "income", category_id: "sal" }, cats)).toBe(true);
    expect(isSalaryIncome({ type: "income", category_id: "free" }, cats)).toBe(false);
    expect(isSalaryIncome({ type: "expense", category_id: "sal" }, cats)).toBe(false);
    expect(isSalaryIncome({ type: "income", category_id: "x" }, cats)).toBe(false);
    expect(isSalaryIncome({ type: "income", category_id: null }, cats)).toBe(false);
  });
});
