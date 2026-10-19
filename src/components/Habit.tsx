"use client";

import { Check, Flame, Moon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtDate, weekdayName } from "@/lib/domain/dates";
import { dailySeries, dayVerdict, nextMilestone, streakInfo, trackedDays, weekOf } from "@/lib/domain/habits";
import { isLive, spendInRange, txnDate } from "@/lib/domain/ledger";
import { formatINR } from "@/lib/domain/money";
import { closeDay, reopenDay } from "@/lib/store/actions";
import { useData, useSafeToSpend, useStreak, useToday } from "@/lib/store/selectors";
import { useStore } from "@/lib/store/store";
import { Amount, Button, Input, Sheet, cn } from "./ui";

export const MOODS = [
  { emoji: "😌", label: "Calm" },
  { emoji: "🙂", label: "Fine" },
  { emoji: "🎉", label: "Treat day" },
  { emoji: "😬", label: "Spendy" },
];

export function StreakPill() {
  const s = useStreak();
  return (
    <Link
      href="/review"
      className={cn(
        "flex h-9 items-center gap-1 rounded-full border px-3 text-sm font-bold tabular transition active:scale-95",
        s.current > 0 && s.todayDone ? "border-warn/30 bg-warn/12 text-warn" : "border-line bg-surface text-muted",
      )}
      aria-label={`${s.current}-day streak${s.atRisk ? ", log today to keep it" : ""}`}
    >
      <Flame size={16} className={s.current > 0 && s.todayDone ? "fill-warn/40" : undefined} aria-hidden />
      {s.current}
    </Link>
  );
}

/** Mon–Sun bars of daily spend against the daily allowance. */
export function WeekStrip({ allowance }: { allowance: number }) {
  const d = useData();
  const today = useToday();
  const wk = weekOf(today);
  const pts = useMemo(() => dailySeries(d.transactions, d.day_logs, wk.start, wk.end, today), [d.transactions, d.day_logs, wk.start, wk.end, today]);
  const max = Math.max(allowance, ...pts.map((p) => p.spent), 1);
  const total = pts.reduce((a, p) => a + p.spent, 0);
  return (
    <div>
      <div className="relative flex h-28 items-end gap-2" role="img" aria-label={`This week ${formatINR(total)} spent`}>
        {allowance > 0 && <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink/25" style={{ bottom: `${(allowance / max) * 100}%` }} aria-hidden />}
        {pts.map((p) => {
          const h = p.future ? 0 : Math.max((p.spent / max) * 100, p.spent > 0 ? 6 : 0);
          const over = allowance > 0 && p.spent > allowance;
          const isToday = p.date === today;
          return (
            <Link key={p.date} href={`/activity?day=${p.date}`} className="group relative flex h-full flex-1 flex-col items-center justify-end">
              {!p.future && p.spent === 0 && p.date < today ? (
                <span className="mb-1 text-[10px] font-semibold text-good">₹0</span>
              ) : null}
              <div
                className={cn("w-full rounded-lg transition-all", p.future ? "bg-surface-2" : over ? "bg-bad/80" : isToday ? "bg-accent" : "bg-accent/45")}
                style={{ height: p.future ? "8%" : `${h}%`, minHeight: p.future ? 6 : undefined }}
              />
              {p.closed && <Check size={12} className="absolute -top-1 text-good" aria-label="closed" />}
            </Link>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2">
        {pts.map((p) => (
          <span key={p.date} className={cn("flex-1 text-center text-[11px]", p.date === today ? "font-bold text-ink" : "text-muted")}>
            {weekdayName(new Date(`${p.date}T00:00:00Z`).getUTCDay()).slice(0, 1)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The evening ritual: review today, pick a mood, keep the streak. */
export function CloseDayCard({ onOpen }: { onOpen: () => void }) {
  const d = useData();
  const today = useToday();
  const sts = useSafeToSpend();
  const streak = useStreak();
  const closed = d.day_logs.find((l) => l.date === today);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  if (closed) {
    return (
      <button onClick={onOpen} className="mt-3 flex w-full items-center gap-3 rounded-3xl border border-good/25 bg-good/8 p-3.5 text-left">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-good/15 text-xl">{closed.mood ?? "✅"}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Today is closed</span>
          <span className="block truncate text-xs text-muted">{streak.current}-day streak · see you tomorrow</span>
        </span>
        <Check className="text-good" size={20} aria-hidden />
      </button>
    );
  }
  const evening = hour >= 18;
  return (
    <div className={cn("mt-3 flex items-center gap-3 rounded-3xl border p-3.5", evening ? "border-accent/40 bg-accent/10" : "border-line bg-surface")}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <Moon size={20} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{evening ? "Close your day" : "End-of-day check-in"}</p>
        <p className="truncate text-xs text-muted">
          {streak.atRisk ? `Keep your ${streak.current}-day streak alive` : `${formatINR(sts.spentToday)} spent today · 10 seconds`}
        </p>
      </div>
      <Button size="sm" variant={evening ? "primary" : "secondary"} onClick={onOpen}>
        Review
      </Button>
    </div>
  );
}

export function CloseDaySheet({ open, onClose, date: dateProp }: { open: boolean; onClose: () => void; date?: string }) {
  const d = useData();
  const today = useToday();
  const date = dateProp ?? today;
  const sts = useSafeToSpend();
  const setQuickAdd = useStore((s) => s.setQuickAdd);
  const existing = d.day_logs.find((l) => l.date === date);
  const [mood, setMood] = useState<string | null>(existing?.mood ?? null);
  const [note, setNote] = useState(existing?.note ?? "");
  const [done, setDone] = useState(false);
  const spent = date === today ? sts.spentToday : spendInRange(d.transactions, date, date);
  // Past days: the allowance snapshot if closed before, else today's as an estimate.
  const allowance = date === today ? sts.dailyAllowance : existing?.allowance ?? sts.dailyAllowance;
  const verdict = dayVerdict(spent, allowance);
  const todays = d.transactions.filter((t) => isLive(t) && t.type === "expense" && txnDate(t) === date);

  // Streak after closing: computed as if today were closed.
  const after = useMemo(() => {
    const days = trackedDays(d.transactions, d.day_logs);
    days.add(date);
    return streakInfo(days, today);
  }, [d.transactions, d.day_logs, date, today]);

  const close = () => {
    setDone(false);
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title={done ? undefined : date === today ? "Close today" : `Close ${fmtDate(date)}`}>
      {done ? (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="animate-pop text-6xl" aria-hidden>🔥</div>
          <p className="display mt-3 text-4xl">{after.current}-day streak</p>
          <p className="mt-1 text-sm text-muted">
            {after.current >= after.best && after.current > 1 ? "That's your best ever. " : ""}
            Next milestone: {nextMilestone(after.current)} days
          </p>
          <div className="mt-5 flex w-full gap-2">
            <Button className="flex-1" onClick={close}>Done</Button>
            <Link href="/review" onClick={close} className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-accent font-semibold text-accent-ink">
              My progress
            </Link>
          </div>
        </div>
      ) : (
        <div>
          <div className="rounded-3xl bg-surface-2 p-4 text-center">
            <p className="text-xs text-muted">Spent {date === today ? "today" : "that day"}</p>
            <p className="display text-4xl"><Amount value={spent} /></p>
            {allowance > 0 && <p className="mt-0.5 text-xs text-muted">of {formatINR(Math.round(allowance))} daily allowance</p>}
            <p className={cn("mt-2 text-sm font-medium", verdict.tone === "good" ? "text-good" : verdict.tone === "warn" ? "text-warn" : "text-bad")}>{verdict.text}</p>
          </div>

          <p className="mb-2 mt-4 text-sm font-semibold">Anything you forgot to log?</p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {todays.length === 0 && <p className="text-sm text-muted">Nothing logged yet.</p>}
            {todays.map((t) => (
              <div key={t.id} className="flex justify-between text-sm">
                <span className="truncate">{t.merchant ?? "Expense"}</span>
                <Amount value={t.my_share ?? t.amount} className="text-muted" />
              </div>
            ))}
          </div>
          <Button size="sm" className="mt-2" onClick={() => { close(); setQuickAdd({ open: true }); }}>+ Add a spend</Button>

          <p className="mb-2 mt-5 text-sm font-semibold">How did today feel?</p>
          <div className="grid grid-cols-4 gap-2">
            {MOODS.map((m) => (
              <button
                key={m.emoji}
                type="button"
                onClick={() => setMood(mood === m.emoji ? null : m.emoji)}
                aria-pressed={mood === m.emoji}
                className={cn("flex flex-col items-center gap-1 rounded-2xl border py-2.5 text-xs transition active:scale-95", mood === m.emoji ? "border-accent bg-accent/12 text-ink" : "border-line text-muted")}
              >
                <span className="text-2xl">{m.emoji}</span>
                {m.label}
              </button>
            ))}
          </div>
          <Input className="mt-3" placeholder="One line about today (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

          <Button
            variant="primary"
            size="lg"
            className="mt-4 w-full"
            onClick={() => {
              closeDay(date, spent, allowance, mood, note.trim() || null);
              navigator.vibrate?.(25);
              setDone(true);
            }}
          >
            {existing ? "Update" : "Close the day"}
          </Button>
          {existing && (
            <button className="mt-2 min-h-11 w-full text-sm text-muted" onClick={() => { reopenDay(date); close(); }}>
              Reopen day
            </button>
          )}
          <p className="mt-2 text-center text-[11px] text-muted">Closing a day counts towards your streak even if you spent nothing.</p>
        </div>
      )}
    </Sheet>
  );
}
