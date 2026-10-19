import { describe, expect, it } from "vitest";
import { cashEvents, cashForecast } from "../cashflow";
import type { CardSummary } from "../cards";
import type { RecurringRule } from "../../types";

const rule = (over: Partial<RecurringRule>): RecurringRule =>
  ({ id: "r", name: "Rent", kind: "rent", txn_type: "expense", amount: 15000, account_id: null, to_account_id: null, ...over }) as RecurringRule;

describe("cash-flow forecast", () => {
  const liquid = new Set(["bank", "cash"]);
  const cardIds = new Set(["cc"]);

  it("collects bank-side events and skips card-paid and internal transfers", () => {
    const occ = [
      { rule: rule({}), date: "2026-10-25", amount: 15000, posted: false },
      { rule: rule({ id: "s", name: "Salary", txn_type: "income", amount: 85000 }), date: "2026-11-01", amount: 85000, posted: false },
      { rule: rule({ id: "n", name: "Netflix", account_id: "cc" }), date: "2026-10-22", amount: 499, posted: false },
      { rule: rule({ id: "t", name: "ATM", txn_type: "transfer", account_id: "bank", to_account_id: "cash" }), date: "2026-10-23", amount: 2000, posted: false },
      { rule: rule({ id: "sip", name: "SIP", txn_type: "transfer", account_id: "bank", to_account_id: "demat" }), date: "2026-10-28", amount: 5000, posted: false },
      { rule: rule({ id: "p", name: "Paid", amount: 99 }), date: "2026-10-21", amount: 99, posted: true },
    ];
    const card = {
      account: { name: "BOI" }, card: { due_mode: "after_statement", due_day: 5, grace_days: 20 },
      open: { start: "2026-10-16", end: "2026-11-15" }, unbilled: 3000, nextDue: { date: "2026-11-04", amount: 12000, min: 600 },
    } as unknown as CardSummary;
    const ev = cashEvents(occ, [card], "2026-10-20", "2026-12-10", liquid, cardIds);
    expect(ev.map((e) => [e.label, e.amount])).toEqual([
      ["Rent", -15000],
      ["SIP", -5000],
      ["Salary", 85000],
      ["BOI bill", -12000],
      ["BOI (current cycle)", -3000],
    ]);
  });

  it("finds the lowest point and a shortfall", () => {
    const f = cashForecast(20000, "2026-10-20", 10, [
      { date: "2026-10-25", label: "Rent", amount: -15000, kind: "bill" },
      { date: "2026-10-28", label: "Salary", amount: 50000, kind: "income" },
    ], 1000);
    expect(f.points[0]).toEqual({ date: "2026-10-20", balance: 20000 });
    expect(f.low).toEqual({ date: "2026-10-27", balance: -2000 });
    expect(f.shortfall?.date).toBe("2026-10-26"); // exactly ₹0 on the 25th
    expect(f.end).toBe(20000 - 15000 + 50000 - 10 * 1000);
  });
});
