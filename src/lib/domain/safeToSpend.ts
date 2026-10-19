// The Safe-to-Spend engine — PRD section 3 and section 9.
//
//   month  = income − fixed commitments − goal reserve − buffer − spent − IPO holds
//   today  = (month − upcoming variable commitments) ÷ days left in cycle
//
// Spent counts UPI, cash and every card swipe (billed or unbilled) by spend
// date; card bill payments are transfers and never counted again. Friend
// receivables are always excluded.

import type { Account, DateStr, Goal, GoalContribution, Hold, Profile, RecurringRule, Settlement, Transaction } from "../types";
import { type Cycle, daysLeft } from "./cycle";
import { addDays, diffDays, parseDate } from "./dates";
import { goalReserve } from "./goals";
import { accountBalance, isLiquid, isLive, spendInRange, txnDate } from "./ledger";
import { round2, sum } from "./money";
import { type Occurrence, isVariable, occurrencesInRange } from "./recurring";

export interface SafeToSpendInput {
  profile: Pick<Profile, "salary" | "buffer_pct">;
  cycle: Cycle;
  today: DateStr;
  accounts: Account[];
  transactions: Transaction[];
  settlements: Settlement[];
  rules: RecurringRule[];
  goals: Goal[];
  contributions: GoalContribution[];
  holds: Hold[];
}

export interface SafeToSpend {
  cycle: Cycle;
  income: number;
  incomePosted: number;
  expectedSalary: number; // added while salary hasn't landed
  fixedCommitments: number;
  commitmentItems: Occurrence[];
  investments: number; // posted SIP / IPO allotment / loan transfers this cycle
  variableUpcoming: number;
  variableItems: Occurrence[];
  goalReserve: number;
  buffer: number;
  spent: number;
  spentToday: number;
  holds: number;
  month: number;
  daysLeft: number;
  /** Daily allowance at the start of today (unused amounts roll into it). */
  dailyAllowance: number;
  todayLeft: number;
  /** Positive when today's spend went past the allowance. */
  todayOverBy: number;
  weekLeft: number;
  trueCash: number;
  liquid: number;
  cardOutstanding: number;
}

const isInvestmentLike = (a: Account | undefined) => !!a && (a.type === "demat" || a.type === "loan");

export function computeSafeToSpend(i: SafeToSpendInput): SafeToSpend {
  const { cycle, today } = i;
  const live = i.transactions.filter(isLive);
  const inCycle = live.filter((t) => {
    const d = txnDate(t);
    return d >= cycle.start && d <= cycle.end;
  });
  const accById = new Map(i.accounts.map((a) => [a.id, a]));

  // Income: posted income in the cycle, or expected salary before it arrives.
  const incomeTx = inCycle.filter((t) => t.type === "income" && !t.exclude_from_budget);
  const incomePosted = sum(incomeTx.map((t) => t.amount));
  const salaryRule = i.rules.find((r) => r.active && r.kind === "salary");
  const salaryLanded = incomeTx.some((t) => t.is_salary || (salaryRule && t.recurring_rule_id === salaryRule.id));
  const expectedSalary = salaryLanded ? 0 : salaryRule ? salaryRule.amount : i.profile.salary;
  const income = round2(incomePosted + expectedSalary);

  // Commitments: unposted outflow rules due in this cycle (salary/income rules excluded).
  const occ = occurrencesInRange(
    i.rules.filter((r) => r.txn_type !== "income"),
    live,
    cycle.start,
    cycle.end,
  ).filter((o) => !o.posted);
  const commitmentItems = occ.filter((o) => !isVariable(o.rule));
  const variableItems = occ.filter((o) => isVariable(o.rule) && o.date >= today);
  const fixedCommitments = sum(commitmentItems.map((o) => o.amount));
  const variableUpcoming = sum(variableItems.map((o) => o.amount));

  // Investments (SIP, IPO allotment) and loan repayments are commitments, not spend.
  const investments = round2(
    Math.max(
      sum(
        inCycle
          .filter((t) => t.type === "transfer")
          .map((t) => {
            const to = isInvestmentLike(accById.get(t.to_account_id ?? ""));
            const from = isInvestmentLike(accById.get(t.account_id ?? ""));
            return to && !from ? t.amount : from && !to ? -t.amount : 0;
          }),
      ),
      0,
    ),
  );

  const reserve = goalReserve(i.goals, i.contributions, cycle);
  const buffer = round2((income * i.profile.buffer_pct) / 100);
  const spent = spendInRange(live, cycle.start, cycle.end);
  const spentToday = spendInRange(live, today, today);
  const holds = sum(i.holds.filter((h) => h.status === "active").map((h) => h.amount));

  const month = round2(income - fixedCommitments - investments - reserve - buffer - spent - holds);
  const dl = daysLeft(cycle, today);
  const startOfToday = month + spentToday;
  const dailyAllowance = round2((startOfToday - variableUpcoming) / dl);
  const todayRaw = round2(dailyAllowance - spentToday);

  // This week: allowance for the remaining days through Sunday (within the cycle).
  const weekday = parseDate(today).getUTCDay(); // 0 = Sun
  const weekEnd = addDays(today, weekday === 0 ? 0 : 7 - weekday);
  const weekDays = Math.min(diffDays(weekEnd < cycle.end ? weekEnd : cycle.end, today) + 1, dl);
  const weekLeft = round2(Math.max(dailyAllowance * weekDays - spentToday, 0));

  const liquid = sum(i.accounts.filter((a) => isLiquid(a) && !a.archived).map((a) => accountBalance(a, live, i.settlements)));
  const cardOutstanding = sum(
    i.accounts
      .filter((a) => a.type === "credit_card" && !a.archived)
      .map((a) => Math.max(-accountBalance(a, live, i.settlements), 0)),
  );

  return {
    cycle,
    income,
    incomePosted,
    expectedSalary,
    fixedCommitments,
    commitmentItems,
    investments,
    variableUpcoming,
    variableItems,
    goalReserve: reserve,
    buffer,
    spent,
    spentToday,
    holds,
    month,
    daysLeft: dl,
    dailyAllowance: Math.max(dailyAllowance, 0),
    todayLeft: Math.max(todayRaw, 0),
    todayOverBy: Math.max(-todayRaw, 0),
    weekLeft,
    trueCash: round2(liquid - cardOutstanding - holds),
    liquid,
    cardOutstanding,
  };
}
