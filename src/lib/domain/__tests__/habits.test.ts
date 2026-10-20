import { describe, expect, it } from "vitest";
import { badges, dailySeries, dayVerdict, noSpendDays, streakInfo, trackedDays, weekOf, weekReview, weeklyChallenge } from "../habits";
import type { DayLog } from "../../types";
import { txn } from "./fixtures";

const log = (date: string, spent = 0, allowance = 500): DayLog => ({ id: date, date, mood: null, note: null, spent, allowance, closed_at: `${date}T15:00:00Z` });

describe("habits", () => {
  it("counts manual logs and closed days, not auto-posted rows", () => {
    const days = trackedDays(
      [txn({ date: "2026-10-17" }), txn({ date: "2026-10-16", recurring_rule_id: "r1" }), txn({ date: "2026-10-15", deleted_at: "2026-10-15T00:00:00Z" })],
      [log("2026-10-18")],
    );
    expect([...days].sort()).toEqual(["2026-10-17", "2026-10-18"]);
  });

  it("streak survives until the end of today", () => {
    const days = new Set(["2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(streakInfo(days, "2026-10-19")).toMatchObject({ current: 3, todayDone: false, atRisk: true });
    days.add("2026-10-19");
    expect(streakInfo(days, "2026-10-19")).toMatchObject({ current: 4, todayDone: true, atRisk: false, best: 4 });
    expect(streakInfo(days, "2026-10-21")).toMatchObject({ current: 0, atRisk: false, best: 4 });
  });

  it("best streak looks at the whole history", () => {
    const days = new Set(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-10"]);
    expect(streakInfo(days, "2026-10-10")).toMatchObject({ current: 1, best: 4 });
  });

  it("weeks start on Monday", () => {
    expect(weekOf("2026-10-19")).toEqual({ start: "2026-10-19", end: "2026-10-25" }); // Monday
    expect(weekOf("2026-10-25")).toEqual({ start: "2026-10-19", end: "2026-10-25" }); // Sunday
  });

  it("no-spend days exclude today and ignore transfers", () => {
    const txns = [txn({ date: "2026-10-13", amount: 50 }), txn({ date: "2026-10-14", type: "transfer", amount: 900 })];
    expect(noSpendDays(txns, "2026-10-12", "2026-10-18", "2026-10-15")).toEqual(["2026-10-12", "2026-10-14"]);
  });

  it("daily series uses my share and marks future days", () => {
    const s = dailySeries([txn({ date: "2026-10-13", amount: 300, my_share: 100 })], [log("2026-10-13", 100)], "2026-10-12", "2026-10-15", "2026-10-13");
    expect(s.map((p) => p.spent)).toEqual([0, 100, 0, 0]);
    expect(s[1].closed).toBe(true);
    expect(s[3].future).toBe(true);
  });

  it("week review compares with last week", () => {
    const txns = [txn({ date: "2026-10-06", amount: 1000 }), txn({ date: "2026-10-13", amount: 600 }), txn({ date: "2026-10-14", amount: 200 })];
    const r = weekReview(txns, [], [], "2026-10-12", "2026-10-19");
    expect(r.spent).toBe(800);
    expect(r.prevSpent).toBe(1000);
    expect(r.change).toBe(-0.2);
    expect(r.biggest?.amount).toBe(600);
    expect(r.noSpend).toBe(5);
  });

  it("mid-week compares against the same days last week", () => {
    const txns = [txn({ date: "2026-10-12", amount: 100 }), txn({ date: "2026-10-16", amount: 900 }), txn({ date: "2026-10-19", amount: 150 })];
    const r = weekReview(txns, [], [], "2026-10-19", "2026-10-19");
    expect(r.prevSpent).toBe(100);
    expect(r.change).toBe(0.5);
  });

  it("badges track progress", () => {
    const b = badges({ txns: [txn({ date: "2026-10-18" })], logs: [log("2026-10-18", 0)], goals: [], contributions: [], streak: streakInfo(new Set(["2026-10-18"]), "2026-10-18"), today: "2026-10-18" });
    expect(b.find((x) => x.id === "first")?.earned).toBe(true);
    expect(b.find((x) => x.id === "nospend")?.earned).toBe(true);
    expect(b.find((x) => x.id === "streak3")?.progress).toBeCloseTo(1 / 3);
  });

  it("day verdict", () => {
    expect(dayVerdict(0, 500).tone).toBe("good");
    expect(dayVerdict(600, 500).tone).toBe("warn");
    expect(dayVerdict(2000, 500).tone).toBe("bad");
  });
});

describe("weekly challenge", () => {
  it("is stable within a week and reachable", () => {
    const txns = [txn({ date: "2026-10-13", amount: 1000 }), txn({ date: "2026-10-20", amount: 100 })];
    const a = weeklyChallenge(txns, [], [], "2026-10-20");
    const b = weeklyChallenge(txns, [], [], "2026-10-22");
    expect(a.id).toBe(b.id);
    expect(a.need).toBeGreaterThan(0);
  });
  it("caps are measured against this week's spend", () => {
    const txns = [txn({ date: "2026-10-13", amount: 1000 }), txn({ date: "2026-10-20", amount: 100 })];
    // Try every rotation by moving across weeks with the same relative data.
    const seen = new Set<string>();
    for (let w = 0; w < 6; w++) {
      const shift = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + w * 7 * 864e5).toISOString().slice(0, 10);
      const c = weeklyChallenge(txns.map((t) => ({ ...t, occurred_at: `${shift(t.occurred_at.slice(0, 10))}T06:30:00.000Z` })), [], [], shift("2026-10-20"));
      seen.add(c.id);
      if (c.id === "lessthanlast") expect(c).toMatchObject({ have: 100, need: 1000, onTrack: true, done: false });
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
