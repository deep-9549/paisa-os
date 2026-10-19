"use client";

import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { useMemo, useState } from "react";
import { CloseDaySheet } from "@/components/Habit";
import { Amount, Button, Card, PageHeader, SectionTitle, cn } from "@/components/ui";
import { addDays, fmtDate, parseDate, toDateStr } from "@/lib/domain/dates";
import { badges, nextMilestone, noSpendDays, trackedDays, weekOf, weekReview } from "@/lib/domain/habits";
import { formatINR } from "@/lib/domain/money";
import { useData, useStreak, useToday } from "@/lib/store/selectors";

export default function ReviewPage() {
  const d = useData();
  const today = useToday();
  const streak = useStreak();
  const [weekStart, setWeekStart] = useState(() => weekOf(today).start);
  const [closing, setClosing] = useState<string | null>(null);
  const days = useMemo(() => trackedDays(d.transactions, d.day_logs), [d.transactions, d.day_logs]);
  const review = useMemo(() => weekReview(d.transactions, d.day_logs, d.categories, weekStart, today), [d, weekStart, today]);
  const all = useMemo(() => badges({ txns: d.transactions, logs: d.day_logs, goals: d.goals, contributions: d.goal_contributions, streak, today }), [d, streak, today]);
  const next = nextMilestone(streak.current);
  const yesterday = addDays(today, -1);
  const yesterdayOpen = !d.day_logs.some((l) => l.date === yesterday);
  const isThisWeek = weekStart === weekOf(today).start;

  return (
    <div>
      <PageHeader back="/" title="Your progress" subtitle="Small daily check-ins add up" />

      <section className="hero overflow-hidden rounded-[28px] border border-line p-5 shadow-card">
        <div className="flex items-center gap-4">
          <div className={cn("flex h-16 w-16 items-center justify-center rounded-3xl", streak.current ? "bg-warn/15 text-warn" : "bg-ink/10 text-muted")}>
            <Flame size={34} className={streak.current ? "fill-warn/40" : undefined} aria-hidden />
          </div>
          <div>
            <p className="display text-4xl">{streak.current} day{streak.current === 1 ? "" : "s"}</p>
            <p className="text-sm text-muted">current streak · best {streak.best}</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{streak.atRisk ? "Log or close today to keep it going" : streak.todayDone ? "Today counted ✓" : "Start a streak today"}</span>
            <span>next: {next} days</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-warn transition-all" style={{ width: `${(streak.current / next) * 100}%` }} />
          </div>
        </div>
        {yesterdayOpen && (
          <Button size="sm" className="mt-4" onClick={() => setClosing(yesterday)}>
            Close yesterday ({fmtDate(yesterday)})
          </Button>
        )}
      </section>

      <SectionTitle>Habit calendar</SectionTitle>
      <Card>
        <HabitCalendar days={days} today={today} onPick={(day) => day <= today && setClosing(day)} />
      </Card>

      <SectionTitle
        action={
          <div className="flex items-center gap-1">
            <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-2" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week"><ChevronLeft size={18} /></button>
            <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30" disabled={isThisWeek} onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week"><ChevronRight size={18} /></button>
          </div>
        }
      >
        {isThisWeek ? "This week" : `Week of ${fmtDate(review.start)}`}
      </SectionTitle>
      <Card>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted">Spent {fmtDate(review.start)} – {fmtDate(review.end)}</p>
            <p className="display text-3xl"><Amount value={review.spent} /></p>
          </div>
          {review.change !== null && (
            <span className={cn("flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-bold", review.change <= 0 ? "bg-good/15 text-good" : "bg-bad/15 text-bad")}>
              {review.change <= 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
              {Math.abs(Math.round(review.change * 100))}% vs last week
            </span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Mini label="No-spend days" value={String(review.noSpend)} />
          <Mini label="Days tracked" value={`${review.daysTracked}/7`} />
          <Mini label="Spends" value={String(review.txnCount)} />
        </div>
        <div className="mt-4 space-y-2 text-sm">
          {review.topCategory && (
            <p className="flex justify-between gap-2">
              <span className="text-muted">Most went to</span>
              <span className="font-medium">{review.topCategory.category?.icon} {review.topCategory.category?.name ?? "Uncategorised"} · {formatINR(review.topCategory.amount)}</span>
            </p>
          )}
          {review.biggest && (
            <p className="flex justify-between gap-2">
              <span className="text-muted">Biggest spend</span>
              <span className="truncate font-medium">{review.biggest.merchant ?? "Expense"} · {formatINR(review.biggest.my_share ?? review.biggest.amount)}</span>
            </p>
          )}
          {review.txnCount === 0 && <p className="text-muted">No spends this week yet.</p>}
        </div>
        <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-sm">{weekTip(review)}</p>
      </Card>

      <SectionTitle>Badges · {all.filter((b) => b.earned).length}/{all.length}</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {all.map((b) => (
          <div key={b.id} className={cn("rounded-3xl border p-3.5", b.earned ? "border-accent/30 bg-accent/8" : "border-line bg-surface")}>
            <div className={cn("text-3xl", !b.earned && "opacity-30 grayscale")} aria-hidden>{b.emoji}</div>
            <p className="mt-1.5 text-sm font-semibold">{b.title}</p>
            <p className="text-xs text-muted">{b.body}</p>
            {!b.earned && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-accent" style={{ width: `${b.progress * 100}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      <CloseDaySheet key={closing ?? "none"} open={!!closing} date={closing ?? undefined} onClose={() => setClosing(null)} />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-2.5">
      <p className="text-lg font-bold tabular">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

function weekTip(r: ReturnType<typeof weekReview>): string {
  if (r.txnCount === 0) return "🌱 A fresh week. Log your first spend, or close the day to start a streak.";
  if (r.change !== null && r.change <= -0.15) return `🎉 You spent ${Math.abs(Math.round(r.change * 100))}% less than last week. Whatever you did, keep doing it.`;
  if (r.change !== null && r.change >= 0.25 && r.topCategory) return `👀 Spending is up. ${r.topCategory.category?.name ?? "One category"} is the biggest driver — worth a look.`;
  if (r.noSpend >= 2) return `🧘 ${r.noSpend} no-spend days this week. That's how budgets stretch.`;
  if (r.daysTracked < 4) return "📒 Try closing each day for a week. It takes 10 seconds and the numbers get much sharper.";
  return "👍 Steady week. Try one no-spend day to give next week some room.";
}

function HabitCalendar({ days, today, onPick }: { days: Set<string>; today: string; onPick: (d: string) => void }) {
  const d = useData();
  const [month, setMonth] = useState(today.slice(0, 7) + "-01");
  const m = parseDate(month);
  const start = month;
  const len = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
  const end = addDays(start, len - 1);
  const pad = (m.getUTCDay() + 6) % 7; // Monday first
  const closed = new Map(d.day_logs.map((l) => [l.date, l]));
  const zero = new Set(noSpendDays(d.transactions, start, end, today));
  const cells = [...Array(pad).fill(null), ...Array.from({ length: len }, (_, i) => addDays(start, i))];
  const tracked = cells.filter((c) => c && days.has(c)).length;
  const shift = (n: number) => setMonth(toDateStr(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + n, 1))));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-2" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
        <span className="text-sm font-semibold">
          {m.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })} · {tracked} day{tracked === 1 ? "" : "s"} tracked
        </span>
        <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30" disabled={month >= today.slice(0, 7) + "-01"} onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-muted">
        {["M", "T", "W", "T", "F", "S", "S"].map((x, i) => <div key={i}>{x}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`p${i}`} />;
          const on = days.has(day);
          const log = closed.get(day);
          return (
            <button
              key={day}
              onClick={() => onPick(day)}
              disabled={day > today}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-xl text-xs font-medium transition",
                on ? "bg-accent text-accent-ink" : day > today ? "text-muted/40" : "bg-surface-2 text-muted",
                day === today && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
              )}
              aria-label={`${fmtDate(day)}${on ? ", tracked" : ""}${zero.has(day) ? ", no spend" : ""}`}
            >
              {log?.mood ?? parseInt(day.slice(8))}
              {zero.has(day) && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-good" />}
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-accent" /> tracked</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-good" /> no spend</span>
        <span>Tap a past day to close it</span>
      </p>
    </div>
  );
}
