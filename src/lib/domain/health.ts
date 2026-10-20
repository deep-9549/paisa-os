// Money health: one 0–100 score from six habits that matter most, each with a
// plain-English tip. Factors without data (no cards, no budgets yet) drop out
// and the rest are re-weighted, so a new user isn't punished for what they
// haven't set up.

export interface HealthInput {
  /** Last full month: (income − spend) ÷ income. */
  savingsRate: number | null;
  /** Bank + cash ÷ typical monthly spend. */
  emergencyMonths: number | null;
  /** Highest card utilisation, 0–1. */
  utilisation: number | null;
  /** Share of budgets kept last month, 0–1. */
  budgetsKept: number | null;
  /** True when no card statement is overdue. */
  billsOnTime: boolean | null;
  /** Days tracked out of the last 14. */
  trackedDays: number;
}

export interface HealthFactor {
  id: string;
  label: string;
  weight: number;
  /** 0–1, or null when there's no data. */
  score: number | null;
  detail: string;
  tip: string;
}

export interface Health {
  score: number;
  grade: "Excellent" | "Good" | "Fair" | "Needs work";
  factors: HealthFactor[];
}

const clamp = (x: number) => Math.min(Math.max(x, 0), 1);
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function healthScore(i: HealthInput): Health {
  const factors: HealthFactor[] = [
    {
      id: "savings",
      label: "Savings rate",
      weight: 25,
      score: i.savingsRate === null ? null : clamp(i.savingsRate / 0.25),
      detail: i.savingsRate === null ? "No income recorded last month" : `${pct(i.savingsRate)} of last month's income kept`,
      tip: i.savingsRate !== null && i.savingsRate >= 0.25 ? "Great — keep a quarter or more of every salary." : "Aim to keep 20–25% of income. Start with a goal that takes its share on salary day.",
    },
    {
      id: "emergency",
      label: "Emergency cushion",
      weight: 20,
      score: i.emergencyMonths === null ? null : clamp(i.emergencyMonths / 6),
      detail: i.emergencyMonths === null ? "Not enough spending history yet" : `${i.emergencyMonths.toFixed(1)} months of spending in the bank`,
      tip: i.emergencyMonths !== null && i.emergencyMonths >= 6 ? "Six months covered. Extra cash could be invested." : "Build up to 6 months of expenses in an emergency fund goal.",
    },
    {
      id: "cards",
      label: "Card utilisation",
      weight: 15,
      score: i.utilisation === null ? null : clamp((0.5 - i.utilisation) / 0.4),
      detail: i.utilisation === null ? "No credit cards" : `${pct(i.utilisation)} of your limit in use`,
      tip: i.utilisation !== null && i.utilisation <= 0.1 ? "Low utilisation helps your credit score." : "Keep card balances under 30% of the limit (under 10% is ideal). Pay before the statement date.",
    },
    {
      id: "budgets",
      label: "Budgets kept",
      weight: 15,
      score: i.budgetsKept,
      detail: i.budgetsKept === null ? "No budgets set" : `${pct(i.budgetsKept)} of budgets kept last month`,
      tip: i.budgetsKept === null ? "Set budgets for your top 3 categories — the app suggests amounts from your history." : i.budgetsKept >= 0.8 ? "Nicely on plan." : "Raise budgets that are always blown, or trim the category that slips most.",
    },
    {
      id: "bills",
      label: "Bills on time",
      weight: 10,
      score: i.billsOnTime === null ? null : i.billsOnTime ? 1 : 0,
      detail: i.billsOnTime === null ? "No card bills" : i.billsOnTime ? "No overdue card statements" : "A card statement is overdue",
      tip: i.billsOnTime === false ? "Pay at least the minimum today to avoid late fees and interest." : "Turn on reminders so card bills never slip.",
    },
    {
      id: "tracking",
      label: "Tracking habit",
      weight: 15,
      score: clamp(i.trackedDays / 12),
      detail: `${i.trackedDays} of the last 14 days tracked`,
      tip: i.trackedDays >= 12 ? "Your numbers are trustworthy because you keep them current." : "Close each day in the evening — ten seconds keeps every number honest.",
    },
  ];
  const scored = factors.filter((f) => f.score !== null);
  const totalWeight = scored.reduce((a, f) => a + f.weight, 0);
  const score = totalWeight ? Math.round((scored.reduce((a, f) => a + f.weight * (f.score as number), 0) / totalWeight) * 100) : 0;
  const grade = score >= 85 ? "Excellent" : score >= 65 ? "Good" : score >= 45 ? "Fair" : "Needs work";
  return { score, grade, factors };
}
