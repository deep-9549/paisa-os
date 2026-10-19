"use client";

import Link from "next/link";
import { useState } from "react";
import { CardForm } from "@/components/CardForm";
import { Amount, Badge, Button, Empty, PageHeader, Progress, Sheet } from "@/components/ui";
import { diffDays, fmtDate, relativeDay } from "@/lib/domain/dates";
import { formatINR } from "@/lib/domain/money";
import { useCardSummaries, useSafeToSpend, useToday } from "@/lib/store/selectors";

export default function CardsPage() {
  const cards = useCardSummaries();
  const today = useToday();
  const sts = useSafeToSpend();
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <PageHeader title="Cards" subtitle={<>Outstanding <Amount value={sts.cardOutstanding} /> · true cash <Amount value={sts.trueCash} /></>} action={<Button size="sm" onClick={() => setAdding(true)}>+ Card</Button>} />
      {cards.length === 0 && <Empty icon="💳" title="No credit cards" body="Add a card to track cycles, statements, dues and rewards." action={<Button variant="primary" onClick={() => setAdding(true)}>Add card</Button>} />}
      <div className="space-y-3">
        {cards.map((c) => {
          const due = c.nextDue;
          const n = due ? diffDays(due.date, today) : null;
          return (
            <Link key={c.card.account_id} href={`/cards/${c.card.account_id}`} className="block overflow-hidden rounded-3xl border border-line bg-surface hover:bg-surface-2">
              <div className="p-5" style={{ background: `linear-gradient(135deg, ${c.account.color}55, transparent 70%)` }}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{c.account.name}</p>
                    <p className="text-xs text-muted">•••• {c.card.last4} {c.card.is_rupay_upi && "· RuPay UPI"}</p>
                  </div>
                  {due && due.amount > 0 ? (
                    <Badge tone={n! < 0 ? "bad" : n! <= 5 ? "warn" : "neutral"}>{n! < 0 ? "overdue" : `due ${relativeDay(due.date, today)}`}</Badge>
                  ) : (
                    <Badge tone="good">all paid</Badge>
                  )}
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
                  <div><p className="text-[11px] text-muted">Unbilled</p><Amount value={c.unbilled} className="font-semibold" /></div>
                  <div><p className="text-[11px] text-muted">Statement due</p><Amount value={c.billedDue} className="font-semibold" /></div>
                  <div><p className="text-[11px] text-muted">Available</p><Amount value={c.available} className="font-semibold" /></div>
                </div>
                <div className="mt-4"><Progress value={c.utilisation} tone={c.utilisation > 0.3 ? "warn" : "ok"} label="Utilisation" /></div>
                <p className="mt-1 text-[11px] text-muted">
                  {Math.round(c.utilisation * 100)}% of {formatINR(c.card.credit_limit, { compact: true })} · cycle {fmtDate(c.open.start)}–{fmtDate(c.open.end)}
                  {c.utilisation > 0.3 && " · above 30%"}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add credit card">
        <CardForm onDone={() => setAdding(false)} />
      </Sheet>
    </div>
  );
}
