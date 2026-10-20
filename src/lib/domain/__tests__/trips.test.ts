import { describe, expect, it } from "vitest";
import { activeTrip, tripSummary, tripTag } from "../trips";
import type { Trip } from "../../types";
import { txn } from "./fixtures";

const trip: Trip = {
  id: "t", name: "Goa 2026", emoji: "🏖️", tag: "goa2026", budget: 20000, start_date: "2026-11-01", end_date: "2026-11-05",
  currency: null, fx_rate: null, separate_budget: true, archived: false, created_at: "",
};

describe("trips", () => {
  it("makes a tag from the name", () => expect(tripTag("Goa 2026!")).toBe("goa2026"));
  it("finds the active trip", () => {
    expect(activeTrip([trip], "2026-10-31")).toBeNull();
    expect(activeTrip([trip], "2026-11-03")?.id).toBe("t");
    expect(activeTrip([{ ...trip, archived: true }], "2026-11-03")).toBeNull();
  });
  it("sums my share of tagged spends minus refunds", () => {
    const txns = [
      txn({ date: "2026-11-01", amount: 6000, my_share: 2000, tags: ["goa2026"] }),
      txn({ date: "2026-11-02", amount: 3000, tags: ["goa2026"] }),
      txn({ date: "2026-11-02", type: "refund", amount: 500, tags: ["goa2026"] }),
      txn({ date: "2026-11-02", amount: 999, tags: ["other"] }),
    ];
    const s = tripSummary(trip, txns, [], "2026-11-02");
    expect(s.spent).toBe(4500);
    expect(s.left).toBe(15500);
    expect(s.dayNo).toBe(2);
    expect(s.perDay).toBe(2250);
    expect(s.perDayLeft).toBe(round(15500 / 4));
  });
});
const round = (x: number) => Math.round(x * 100) / 100;
