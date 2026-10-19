"use client";

import { Repeat, X } from "lucide-react";
import { useMemo, useState } from "react";
import { fmtDate } from "@/lib/domain/dates";
import { formatINR } from "@/lib/domain/money";
import { type RecurringCandidate, detectRecurring } from "@/lib/domain/recurring";
import { trackCandidate } from "@/lib/store/actions";
import { useData, useToday } from "@/lib/store/selectors";
import { Button } from "./ui";

const KEY = "paisa:dismissed-recurring";

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Repeating spends that aren't tracked yet, minus the ones this viewer dismissed. */
export function useSpotted(): [RecurringCandidate[], (m: string) => void] {
  const d = useData();
  const today = useToday();
  const [dismissed, setDismissed] = useState<string[]>(() => (typeof window === "undefined" ? [] : readDismissed()));
  const list = useMemo(
    () => detectRecurring(d.transactions, d.recurring_rules, today).filter((c) => !dismissed.includes(c.merchant.toLowerCase())),
    [d.transactions, d.recurring_rules, today, dismissed],
  );
  const dismiss = (m: string) => {
    const next = [...dismissed, m.toLowerCase()];
    setDismissed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode: dismissal lasts this session only */
    }
  };
  return [list, dismiss];
}

const per = (f: RecurringCandidate["frequency"]) => (f === "monthly" ? "month" : f === "weekly" ? "week" : "year");

export function SpottedCard({ c, onDismiss }: { c: RecurringCandidate; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-3xl border border-info/30 bg-info/8 p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-info/15 text-info">
        <Repeat size={18} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {c.merchant} looks like a {c.frequency} {c.kind === "subscription" ? "subscription" : "bill"}
        </p>
        <p className="text-xs text-muted">
          {formatINR(c.amount)}/{per(c.frequency)} · {c.count} payments, last {fmtDate(c.last)}. Track it so it&apos;s set aside before you spend.
        </p>
        <Button size="sm" className="mt-2" onClick={() => trackCandidate(c)}>Track it</Button>
      </div>
      <button onClick={onDismiss} className="-mr-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-2" aria-label={`Dismiss ${c.merchant}`}>
        <X size={16} />
      </button>
    </div>
  );
}
