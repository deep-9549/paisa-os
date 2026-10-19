"use client";

import { istDate } from "@/lib/domain/dates";
import { budgetImpact, myPaidAmount } from "@/lib/domain/ledger";
import { useLookups } from "@/lib/store/selectors";
import type { Transaction } from "@/lib/types";
import { Amount, Badge, cn } from "./ui";

const METHOD_LABEL: Record<string, string> = { upi: "UPI", card: "Card", cash: "Cash", netbanking: "NetBanking", auto_debit: "Auto-debit", other: "Other" };

export function TxnRow({ t, onClick, selected, selectable }: { t: Transaction; onClick?: () => void; selected?: boolean; selectable?: boolean }) {
  const { acc, cat, friend } = useLookups();
  const c = t.category_id ? cat.get(t.category_id) : undefined;
  const a = t.account_id ? acc.get(t.account_id) : undefined;
  const to = t.to_account_id ? acc.get(t.to_account_id) : undefined;
  const isOut = t.type === "expense";
  const isIn = t.type === "income" || t.type === "refund";
  const title =
    t.merchant ??
    (t.type === "transfer" || t.type === "card_payment" ? `${a?.name ?? "?"} → ${to?.name ?? "?"}` : c?.name ?? (t.type === "adjustment" ? "Adjustment" : "Transaction"));
  const shown = t.type === "expense" ? (t.my_share ?? myPaidAmount(t) ?? t.amount) : t.amount;
  const time = new Date(t.occurred_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const payer = t.paid_by_friend_id ? friend.get(t.paid_by_friend_id)?.name : null;

  return (
    <button type="button" onClick={onClick} className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2", selected && "bg-accent/10")}>
      {selectable && <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs", selected ? "border-accent bg-accent text-accent-ink" : "border-line")}>{selected && "✓"}</span>}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: `${c?.color ?? "#64748b"}22` }} aria-hidden>
        {t.type === "transfer" || t.type === "card_payment" ? "⇄" : t.type === "adjustment" ? "⚖️" : c?.icon ?? (isIn ? "💰" : "🧾")}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{title}</span>
          {t.is_draft && <Badge tone="warn">confirm</Badge>}
          {t.my_share !== null && <Badge tone="info">split</Badge>}
          {t.emi_id && t.type === "expense" && !t.merchant?.startsWith("EMI") && <Badge>EMI</Badge>}
          {t.exclude_from_budget && t.type === "expense" && <Badge>excluded</Badge>}
        </div>
        <div className="truncate text-xs text-muted">
          {time} · {payer ? `paid by ${payer}` : METHOD_LABEL[t.method]}
          {a && !payer && ` · ${a.name}`}
          {t.tags.length > 0 && ` · #${t.tags.join(" #")}`}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <Amount value={isOut ? -shown : shown} className={cn("text-sm font-semibold", isIn && "text-good", !isOut && !isIn && "text-muted")} sign={isIn} />
        {t.my_share !== null && t.type === "expense" && <div className="text-[11px] text-muted">of <Amount value={t.amount} /></div>}
        {t.type === "expense" && budgetImpact(t) === 0 && !t.exclude_from_budget && !t.is_draft && <div className="text-[11px] text-muted">no budget impact</div>}
      </div>
    </button>
  );
}

export function groupByDay(txns: Transaction[]): [string, Transaction[]][] {
  const m = new Map<string, Transaction[]>();
  for (const t of txns) {
    const k = istDate(t.occurred_at);
    m.set(k, [...(m.get(k) ?? []), t]);
  }
  return [...m];
}
