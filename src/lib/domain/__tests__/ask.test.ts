import { describe, expect, it } from "vitest";
import { type AskContext, ask, parsePeriod } from "../ask";
import type { Category, Friend } from "../../types";
import { txn } from "./fixtures";

const cats: Category[] = [
  { id: "food", name: "Food", parent_id: null, icon: "🍽️", color: "#f00", kind: "expense" },
  { id: "deliv", name: "Delivery", parent_id: "food", icon: "🛵", color: "#f00", kind: "expense" },
  { id: "tea", name: "Tea & snacks", parent_id: "food", icon: "☕", color: "#f00", kind: "expense" },
  { id: "trans", name: "Transport", parent_id: null, icon: "🚗", color: "#00f", kind: "expense" },
];
const rahul: Friend = { id: "f1", name: "Rahul", upi_id: null, phone: null, color: "#000", archived: false };

const ctx = (over: Partial<AskContext> = {}): AskContext => ({
  today: "2026-10-19",
  cycle: { start: "2026-10-01", end: "2026-10-31", length: 31 },
  prevCycle: { start: "2026-09-01", end: "2026-09-30", length: 30 },
  txns: [
    txn({ date: "2026-10-05", amount: 450, merchant: "Swiggy", category_id: "deliv" }),
    txn({ date: "2026-10-18", amount: 20, merchant: "Chai Point", category_id: "tea" }),
    txn({ date: "2026-10-19", amount: 300, merchant: "Uber", category_id: "trans" }),
    txn({ date: "2026-09-10", amount: 900, merchant: "Swiggy", category_id: "deliv" }),
    txn({ date: "2026-10-12", amount: 5000, type: "transfer" }),
  ],
  categories: cats,
  friends: [rahul],
  friendBalances: new Map([["f1", 350]]),
  safe: { month: 10000, todayLeft: 800, dailyAllowance: 900, daysLeft: 13, trueCash: 50000 },
  netWorth: 250000,
  cards: [],
  ...over,
});

describe("ask", () => {
  it("parses periods", () => {
    const c = ctx();
    expect(parsePeriod("food last month", c.today, c.cycle, c.prevCycle).period).toMatchObject({ start: "2026-09-01", end: "2026-09-30" });
    expect(parsePeriod("uber this week", c.today, c.cycle, c.prevCycle).period).toMatchObject({ start: "2026-10-19", end: "2026-10-19" });
    expect(parsePeriod("swiggy in sep", c.today, c.cycle, c.prevCycle).period).toMatchObject({ start: "2026-09-01", end: "2026-09-30" });
    expect(parsePeriod("december", c.today, c.cycle, c.prevCycle).period.start).toBe("2025-12-01");
    expect(parsePeriod("last 7 days", c.today, c.cycle, c.prevCycle).period).toMatchObject({ start: "2026-10-13", end: "2026-10-19" });
    expect(parsePeriod("last year", c.today, c.cycle, c.prevCycle).period.start).toBe("2025-01-01");
    expect(parsePeriod("food", c.today, c.cycle, c.prevCycle).matched).toBe(false);
  });

  it("totals a category including sub-categories, ignoring transfers", () => {
    const a = ask("how much on food this month", ctx());
    expect(a.kind).toBe("spend");
    expect(a.value).toBe(470);
  });

  it("maps keywords to categories", () => {
    expect(ask("chai", ctx()).value).toBe(20);
  });

  it("matches merchants and compares with the previous period", () => {
    const a = ask("swiggy last month", ctx());
    expect(a.value).toBe(900);
    expect(ask("swiggy", ctx()).value).toBe(450);
  });

  it("answers affordability from Safe-to-Spend", () => {
    expect(ask("can I afford 500", ctx()).tone).toBe("good");
    expect(ask("can i afford 4k", ctx()).tone).toBe("warn");
    expect(ask("can I afford 20000", ctx()).tone).toBe("bad");
  });

  it("answers friend balances", () => {
    expect(ask("does rahul owe me", ctx()).title).toBe("Rahul owes you ₹350");
    expect(ask("who owes me", ctx()).kind).toBe("owe");
  });

  it("finds the biggest spend and the breakdown", () => {
    expect(ask("biggest spend this month", ctx()).value).toBe(450);
    const w = ask("where did my money go", ctx());
    expect(w.breakdown?.[0]).toMatchObject({ label: "Food", value: 470 });
  });

  it("copes with odd friend names", () => {
    const odd: Friend = { id: "f2", name: "A+ (office)", upi_id: null, phone: null, color: "#000", archived: false };
    expect(() => ask("who owes me", ctx({ friends: [rahul, odd] }))).not.toThrow();
    expect(ask("does a+ owe me", ctx({ friends: [odd], friendBalances: new Map([["f2", -50]]) })).title).toBe("You owe A+ (office) ₹50");
  });

  it("says when it can't find something", () => {
    expect(ask("zzzqqq", ctx()).kind).toBe("none");
  });
});
