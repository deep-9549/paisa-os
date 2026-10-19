// IPO lifecycle math — PRD 4.6 and section 9 "IPO rules".

import type { DateStr, IpoApplication } from "../types";
import { monthsBetween } from "./dates";
import { round2, sum } from "./money";

export const IPO_STAGES: { key: string; label: string; statuses: IpoApplication["status"][] }[] = [
  { key: "blocked", label: "Funds blocked", statuses: ["applied", "blocked"] },
  { key: "allotted", label: "Allotted", statuses: ["allotted", "partial"] },
  { key: "not_allotted", label: "Not allotted", statuses: ["not_allotted"] },
  { key: "listed", label: "Listed / Holding", statuses: ["listed", "holding"] },
  { key: "sold", label: "Sold", statuses: ["sold"] },
];

export const blockedAmount = (lots: number, lotSize: number, bidPrice: number) => round2(lots * lotSize * bidPrice);

export const appliedShares = (a: Pick<IpoApplication, "lots" | "lot_size">) => a.lots * a.lot_size;

export const issuePrice = (a: Pick<IpoApplication, "issue_price" | "bid_price">) => a.issue_price ?? a.bid_price;

/** Released on allotment: (applied − allotted) × bid price, plus any bid-vs-issue difference on allotted shares. */
export function releaseOnAllotment(a: IpoApplication, sharesAllotted: number): { release: number; invested: number } {
  const blocked = blockedAmount(a.lots, a.lot_size, a.bid_price);
  const invested = round2(sharesAllotted * issuePrice(a));
  return { release: round2(blocked - invested), invested };
}

export function listingGainPct(a: Pick<IpoApplication, "listing_price" | "issue_price" | "bid_price">): number | null {
  if (a.listing_price == null) return null;
  const ip = issuePrice(a);
  return ip ? (a.listing_price - ip) / ip : null;
}

export function realisedPnl(a: Pick<IpoApplication, "sell_price" | "issue_price" | "bid_price" | "shares_sold">): number {
  if (a.sell_price == null || !a.shares_sold) return 0;
  return round2((a.sell_price - issuePrice(a)) * a.shares_sold);
}

/** STCG if held < 12 months, else LTCG; rates come from settings because they change. */
export function taxEstimate(
  a: Pick<IpoApplication, "allotment_date" | "sold_date" | "sell_price" | "issue_price" | "bid_price" | "shares_sold">,
  stcgRate: number,
  ltcgRate: number,
): { kind: "STCG" | "LTCG"; tax: number; gain: number } {
  const gain = realisedPnl(a);
  const held = a.allotment_date && a.sold_date ? monthsBetween(a.allotment_date, a.sold_date) : 0;
  const kind = held >= 12 ? "LTCG" : "STCG";
  const rate = kind === "STCG" ? stcgRate : ltcgRate;
  return { kind, gain, tax: round2(Math.max(gain, 0) * (rate / 100)) };
}

export function ipoStats(apps: IpoApplication[]) {
  const decided = apps.filter((a) => !["applied", "blocked"].includes(a.status));
  const hits = decided.filter((a) => a.shares_allotted > 0);
  const pnls = apps.filter((a) => a.status === "sold" || a.shares_sold > 0).map((a) => ({ a, pnl: a.realised_pnl ?? realisedPnl(a) }));
  pnls.sort((x, y) => y.pnl - x.pnl);
  return {
    applied: apps.length,
    totalApplied: sum(apps.map((a) => blockedAmount(a.lots, a.lot_size, a.bid_price))),
    hitRate: decided.length ? hits.length / decided.length : null,
    blockedNow: sum(apps.filter((a) => a.status === "applied" || a.status === "blocked").map((a) => blockedAmount(a.lots, a.lot_size, a.bid_price))),
    lifetimePnl: sum(pnls.map((p) => p.pnl)),
    best: pnls[0] ?? null,
    worst: pnls.length > 1 ? pnls[pnls.length - 1] : null,
  };
}

export interface IpoReminder {
  id: string;
  title: string;
  body: string;
  date: DateStr;
}

/** "allotment out tomorrow", "listing today 10 AM", "mandate expires today". */
export function ipoReminders(apps: IpoApplication[], today: DateStr, tomorrow: DateStr): IpoReminder[] {
  const out: IpoReminder[] = [];
  for (const a of apps) {
    const pending = a.status === "applied" || a.status === "blocked";
    if (pending && a.allotment_date === tomorrow)
      out.push({ id: `ipo-allot-${a.id}-${tomorrow}`, title: `${a.company}: allotment out tomorrow`, body: "Check allotment status and update the app.", date: today });
    if (pending && a.allotment_date && a.allotment_date <= today)
      out.push({ id: `ipo-allot-ask-${a.id}`, title: `${a.company}: were you allotted?`, body: "Mark Allotted, Not allotted or Partial to release the hold.", date: today });
    if (a.listing_date === today && ["allotted", "partial", "holding"].includes(a.status))
      out.push({ id: `ipo-list-${a.id}`, title: `${a.company} lists today 10 AM`, body: "Record the listing price and any sale.", date: today });
    if (pending && a.mandate_date === today)
      out.push({ id: `ipo-mandate-${a.id}`, title: `${a.company}: UPI mandate expires today`, body: "Approve the mandate in your UPI app if you haven't.", date: today });
  }
  return out;
}
