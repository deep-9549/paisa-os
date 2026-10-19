"use client";

import { Check, CircleAlert, Minus } from "lucide-react";
import { Card, PageHeader, Ring, SectionTitle, cn } from "@/components/ui";
import { useHealth } from "@/lib/store/selectors";

export default function HealthPage() {
  const h = useHealth();
  const tone = h.score >= 65 ? "ok" : h.score >= 45 ? "warn" : "over";
  // The factor losing the most points is the biggest win.
  const lost = (f: (typeof h.factors)[number]) => (1 - (f.score ?? 1)) * f.weight;
  const weakest = [...h.factors].sort((a, b) => lost(b) - lost(a))[0];

  return (
    <div>
      <PageHeader back="/more" title="Money health" subtitle="Six habits that matter most, scored 0–100" />
      <section className="hero flex flex-col items-center rounded-[28px] border border-line p-6 text-center shadow-card">
        <Ring value={h.score / 100} tone={tone} size={168} stroke={12}>
          <span className="display text-5xl">{h.score}</span>
          <span className="text-xs text-muted">out of 100</span>
        </Ring>
        <p className="mt-3 text-lg font-bold">{h.grade}</p>
        {weakest && weakest.score !== null && weakest.score < 0.8 && (
          <p className="mt-1 max-w-xs text-sm text-muted">
            Biggest win next: <span className="font-semibold text-ink">{weakest.label.toLowerCase()}</span>. {weakest.tip}
          </p>
        )}
      </section>

      <SectionTitle>What makes up your score</SectionTitle>
      <div className="space-y-2">
        {h.factors.map((f) => {
          const s = f.score;
          const good = s !== null && s >= 0.8;
          const bad = s !== null && s < 0.4;
          return (
            <Card key={f.id}>
              <div className="flex items-start gap-3">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", s === null ? "bg-surface-2 text-muted" : good ? "bg-good/15 text-good" : bad ? "bg-bad/15 text-bad" : "bg-warn/15 text-warn")}>
                  {s === null ? <Minus size={18} aria-hidden /> : good ? <Check size={18} aria-hidden /> : <CircleAlert size={18} aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold">{f.label}</p>
                    <p className="text-xs text-muted tabular">{s === null ? "not counted" : `${Math.round(s * f.weight)}/${f.weight}`}</p>
                  </div>
                  <p className="text-sm text-muted">{f.detail}</p>
                  {s !== null && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div className={cn("h-full rounded-full", good ? "bg-good" : bad ? "bg-bad" : "bg-warn")} style={{ width: `${s * 100}%` }} />
                    </div>
                  )}
                  <p className="mt-2 text-xs">{f.tip}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="mt-4 px-1 text-xs text-muted">Factors with no data yet (no cards, no budgets) are left out and the rest re-weighted. Savings and budgets use your last full budget month.</p>
    </div>
  );
}
