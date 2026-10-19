"use client";

import { ArrowDownRight, ArrowUpRight, CreditCard, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PLAN_TABS, SubTabs } from "@/components/PlanTabs";
import { Amount, Card, Empty, PageHeader, SectionTitle, cn } from "@/components/ui";
import { dayHeading, fmtDate } from "@/lib/domain/dates";
import { formatINR } from "@/lib/domain/money";
import { useCashForecast, useToday } from "@/lib/store/selectors";

const KIND_ICON = { income: ArrowUpRight, bill: ArrowDownRight, card: CreditCard, invest: TrendingUp };

export default function CashFlowPage() {
  const f = useCashForecast(35);
  const today = useToday();
  const data = f.points.map((p) => ({ ...p, label: fmtDate(p.date) }));
  const tone = f.shortfall ? "bad" : f.low.balance < f.dailySpend * 7 ? "warn" : "good";

  return (
    <div>
      <PageHeader title="Plan" subtitle="Where your bank balance is heading over the next 5 weeks" />
      <SubTabs tabs={PLAN_TABS} />

      <section className="hero rounded-[28px] border border-line p-5 shadow-card">
        <p className="text-sm text-muted">Lowest balance ahead</p>
        <p className={cn("display text-4xl", tone === "bad" && "text-bad")}>
          <Amount value={f.low.balance} />
        </p>
        <p className={cn("mt-1 text-sm font-medium", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-good")}>
          {f.shortfall
            ? `You'd run short on ${fmtDate(f.shortfall.date)} — move money in or delay a big spend.`
            : f.low.date === today
              ? "Today is the low point — it only goes up from here."
              : `On ${fmtDate(f.low.date)}${tone === "warn" ? " — that's under a week of spending as a cushion." : ". You're covered."}`}
        </p>

        <div className="-mx-2 mt-4 h-48" role="img" aria-label={`Projected bank balance, lowest ${formatINR(f.low.balance)} on ${fmtDate(f.low.date)}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatINR(v, { compact: true })} />
              <Tooltip
                cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 12 }}
                labelStyle={{ color: "var(--muted)" }}
                formatter={(v) => [formatINR(Number(v)), "Balance"]}
              />
              <ReferenceLine y={0} stroke="var(--bad)" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="balance" stroke="var(--accent)" strokeWidth={2} fill="url(#cf)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
              <ReferenceDot x={fmtDate(f.low.date)} y={f.low.balance} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Mini label="Now" value={f.start} />
          <Mini label="In 5 weeks" value={f.end} />
          <Mini label="Everyday spend" value={f.dailySpend} suffix="/day" />
        </div>
      </section>

      <SectionTitle>What moves it</SectionTitle>
      {f.events.length === 0 ? (
        <Empty icon={<TrendingUp />} title="Nothing scheduled" body="Add salary, rent and bills under Recurring to see them here." />
      ) : (
        <Card className="p-1.5">
          {f.events.map((e, i) => {
            const I = KIND_ICON[e.kind];
            const bal = f.points.find((p) => p.date === e.date)?.balance;
            return (
              <div key={`${e.label}-${e.date}-${i}`} className="flex min-h-14 items-center gap-3 rounded-2xl px-2 py-2">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", e.amount > 0 ? "bg-good/12 text-good" : "bg-surface-2 text-muted")}>
                  <I size={18} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{e.label}</span>
                  <span className="block text-xs text-muted">{dayHeading(e.date, today)}{bal !== undefined && <> · balance after ≈ {formatINR(Math.round(bal))}</>}</span>
                </span>
                <Amount value={e.amount} sign={e.amount > 0} className={cn("text-sm font-semibold", e.amount > 0 && "text-good")} />
              </div>
            );
          })}
        </Card>
      )}
      <p className="mt-3 px-1 text-xs leading-relaxed text-muted">
        Starts from your bank, cash and wallet balances minus IPO holds. Card swipes reach the bank as the card bill on its due date; everyday spending uses your routine run-rate for the part you pay by UPI, cash or bank. Big one-off spends aren&apos;t projected.
      </p>
    </div>
  );
}

function Mini({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-2xl bg-ink/[0.06] p-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={cn("text-sm font-bold tabular", value < 0 && "text-bad")}>
        <Amount value={value} />
        {suffix && <span className="text-[11px] font-normal text-muted">{suffix}</span>}
      </p>
    </div>
  );
}
