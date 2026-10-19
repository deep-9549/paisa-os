// Tax helper (PRD 4.12, P1): rent paid for HRA, IPO capital gains, 80C list.
// The app only prepares data for filing; it never files.

import type { DateStr, IpoApplication, RecurringRule, Transaction } from "../types";
import { taxEstimate } from "./ipo";
import { isLive, txnDate } from "./ledger";
import { round2, sum } from "./money";

export function fyRange(today: DateStr) {
  const y = parseInt(today.slice(0, 4));
  const start = today.slice(5) >= "04-01" ? y : y - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, label: `${start}-${String((start + 1) % 100).padStart(2, "0")}` };
}

export function rentSummary(rules: RecurringRule[], txns: Transaction[], from: DateStr, to: DateStr) {
  const rentRules = rules.filter((r) => r.kind === "rent");
  const ids = new Set(rentRules.map((r) => r.id));
  const paid = txns
    .filter((t) => isLive(t) && t.recurring_rule_id && ids.has(t.recurring_rule_id) && txnDate(t) >= from && txnDate(t) <= to)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const total = sum(paid.map((t) => t.amount));
  return { payments: paid, total, landlordPanNeeded: total > 100000, rules: rentRules };
}

export function capitalGains(apps: IpoApplication[], from: DateStr, to: DateStr, stcgRate: number, ltcgRate: number) {
  const rows = apps
    .filter((a) => a.sold_date && a.sold_date >= from && a.sold_date <= to && a.shares_sold > 0)
    .map((a) => ({ app: a, ...taxEstimate(a, stcgRate, ltcgRate) }));
  return {
    rows,
    stcg: round2(sum(rows.filter((r) => r.kind === "STCG").map((r) => r.gain))),
    ltcg: round2(sum(rows.filter((r) => r.kind === "LTCG").map((r) => r.gain))),
    tax: round2(sum(rows.map((r) => r.tax))),
  };
}

/** 80C candidates: anything tagged 80c, ELSS/PPF/EPF/LIC by merchant or note. */
export function section80C(txns: Transaction[], from: DateStr, to: DateStr) {
  const re = /\b(elss|ppf|epf|vpf|lic|nsc|sukanya|ssy|tax.?saver|80c)\b/i;
  const rows = txns.filter(
    (t) =>
      isLive(t) &&
      txnDate(t) >= from &&
      txnDate(t) <= to &&
      (t.tags.some((g) => g.toLowerCase() === "80c") || re.test(`${t.merchant ?? ""} ${t.note ?? ""}`)),
  );
  const total = sum(rows.map((t) => t.amount));
  return { rows, total, cappedAt150k: Math.min(total, 150000) };
}

/** Indian rupees in words, for rent receipts. */
export function rupeesInWords(n: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ""}`);
  const three = (x: number) => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${two(x % 100)}` : ""}` : two(x));
  let r = Math.floor(n);
  if (r === 0) return "Zero Rupees";
  const parts: string[] = [];
  const crore = Math.floor(r / 1e7); r %= 1e7;
  const lakh = Math.floor(r / 1e5); r %= 1e5;
  const thousand = Math.floor(r / 1e3); r %= 1e3;
  if (crore) parts.push(`${two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (r) parts.push(three(r));
  return `${parts.join(" ")} Rupees Only`;
}
