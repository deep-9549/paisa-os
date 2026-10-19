import { describe, expect, it } from "vitest";
import { healthScore } from "../health";

describe("money health", () => {
  it("scores a strong profile highly", () => {
    const h = healthScore({ savingsRate: 0.3, emergencyMonths: 7, utilisation: 0.05, budgetsKept: 1, billsOnTime: true, trackedDays: 14 });
    expect(h.score).toBe(100);
    expect(h.grade).toBe("Excellent");
  });
  it("drops missing factors and re-weights the rest", () => {
    const h = healthScore({ savingsRate: 0.125, emergencyMonths: null, utilisation: null, budgetsKept: null, billsOnTime: null, trackedDays: 6 });
    // savings 0.5 × 25 + tracking 0.5 × 15 over 40 → 50
    expect(h.score).toBe(50);
    expect(h.factors.find((f) => f.id === "cards")?.score).toBeNull();
  });
  it("penalises high utilisation and overdue bills", () => {
    const h = healthScore({ savingsRate: 0.25, emergencyMonths: 6, utilisation: 0.6, budgetsKept: 1, billsOnTime: false, trackedDays: 12 });
    expect(h.factors.find((f) => f.id === "cards")?.score).toBe(0);
    expect(h.score).toBe(75);
  });
});
