// Savings goals, sinking funds and round-ups — PRD 4.8.

import type { DateStr, Goal, GoalContribution, Transaction } from "../types";
import type { Cycle } from "./cycle";
import { monthsBetween } from "./dates";
import { isLive, txnDate } from "./ledger";
import { round2, sum } from "./money";

export function savedAmount(goal: Goal, contributions: GoalContribution[], before?: DateStr): number {
  return sum(contributions.filter((c) => c.goal_id === goal.id && (!before || c.date < before)).map((c) => c.amount));
}

/** Monthly contribution needed to hit the target by its date, from the start of a cycle. */
export function plannedMonthly(goal: Goal, contributions: GoalContribution[], cycle: Cycle): number {
  if (goal.archived || !goal.target_date) return 0;
  const saved = savedAmount(goal, contributions, cycle.start);
  const left = goal.target - saved;
  if (left <= 0) return 0;
  // Number of cycle starts on or before the target date.
  const sameDayOrLater = goal.target_date.slice(8) >= cycle.start.slice(8) ? 1 : 0;
  const months = Math.max(1, monthsBetween(cycle.start, goal.target_date) + sameDayOrLater);
  return round2(left / months);
}

export function contributedIn(goal: Goal, contributions: GoalContribution[], cycle: Cycle): number {
  return sum(
    contributions.filter((c) => c.goal_id === goal.id && c.date >= cycle.start && c.date <= cycle.end).map((c) => c.amount),
  );
}

/** Reserve held back from Safe-to-Spend: the larger of plan and actual contributions. */
export function goalReserve(goals: Goal[], contributions: GoalContribution[], cycle: Cycle): number {
  return sum(
    goals.filter((g) => !g.archived).map((g) => Math.max(plannedMonthly(g, contributions, cycle), contributedIn(g, contributions, cycle))),
  );
}

/** Virtual round-up for a spend, e.g. ₹183 to the nearest ₹10 → ₹7. */
export function roundUp(amount: number, to: number): number {
  if (!to) return 0;
  const r = Math.ceil(amount / to) * to - amount;
  return round2(r === 0 ? 0 : r);
}

export function emergencyTarget(avgMonthlyExpense: number): number {
  return Math.round(avgMonthlyExpense * 6);
}

export function expensesForRoundup(txns: Transaction[], cycle: Cycle) {
  return txns.filter(
    (t) => isLive(t) && t.type === "expense" && !t.exclude_from_budget && txnDate(t) >= cycle.start && txnDate(t) <= cycle.end,
  );
}
