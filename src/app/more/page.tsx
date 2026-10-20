"use client";

import { Bell, ChartColumn, ChevronRight, CreditCard, Flame, type LucideIcon, Plane, Receipt, Repeat, Rocket, Search, Settings, Target, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Amount, Avatar, PageHeader, Ring, SectionTitle } from "@/components/ui";
import { addDays } from "@/lib/domain/dates";
import { badges } from "@/lib/domain/habits";
import { savedAmount } from "@/lib/domain/goals";
import { occurrencesInRange } from "@/lib/domain/recurring";
import { getProfile } from "@/lib/store/actions";
import { useCardSummaries, useData, useFriendBalances, useHealth, useNetWorth, useSafeToSpend, useStreak, useToday } from "@/lib/store/selectors";
import { useStore } from "@/lib/store/store";

export default function MorePage() {
  const d = useData();
  const p = getProfile(d);
  const today = useToday();
  const nw = useNetWorth();
  const sts = useSafeToSpend();
  const bal = useFriendBalances();
  const cards = useCardSummaries();
  const streak = useStreak();
  const health = useHealth();
  const email = useStore((s) => s.email);
  const owed = [...bal.values()].filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const unread = d.notifications.filter((n) => !n.read).length;
  const due = occurrencesInRange(d.recurring_rules, d.transactions, today, addDays(today, 30)).filter((o) => !o.posted).length;
  const activeGoals = d.goals.filter((g) => !g.archived);
  const earned = badges({ txns: d.transactions, logs: d.day_logs, goals: d.goals, contributions: d.goal_contributions, streak, today }).filter((b) => b.earned).length;
  const cardDue = cards.reduce((a, c) => a + c.unbilled + c.billedDue, 0);
  const goalPct = activeGoals.length ? Math.round((activeGoals.reduce((a, g) => a + Math.min(savedAmount(g, d.goal_contributions) / Math.max(g.target, 1), 1), 0) / activeGoals.length) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="More"
        action={
          <Link href="/settings" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-2" aria-label="Settings">
            <Settings size={20} />
          </Link>
        }
      />

      <Link href="/settings" className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-3.5 shadow-card">
        <Avatar name={p.name} color="var(--accent)" size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{p.name}</p>
          <p className="truncate text-xs text-muted">{email ?? "Local-only · data stays on this device"}</p>
        </div>
        <ChevronRight size={18} className="text-muted" aria-hidden />
      </Link>

      <button onClick={() => useStore.getState().set({ askOpen: true })} className="mt-3 flex h-12 w-full items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3.5 text-sm text-muted">
        <Search size={18} aria-hidden /> Ask Paisa or jump to…
      </button>

      <Link href="/invest/portfolio" className="hero mt-3 block rounded-[28px] border border-line p-5 shadow-card">
        <p className="text-sm text-muted">Net worth</p>
        <p className="display text-4xl"><Amount value={nw.total} /></p>
        <p className="mt-1 text-xs text-muted">
          Investments <Amount value={nw.investments} /> · card dues <Amount value={-nw.cards} />
        </p>
      </Link>

      <Link href="/health" className="mt-2 flex items-center gap-3 rounded-3xl border border-line bg-surface p-3.5 shadow-card transition active:scale-[0.99]">
        <Ring value={health.score / 100} size={52} stroke={6} tone={health.score >= 65 ? "ok" : health.score >= 45 ? "warn" : "over"}>
          <span className="text-sm font-bold tabular">{health.score}</span>
        </Ring>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Money health · {health.grade}</span>
          <span className="block truncate text-xs text-muted">Savings, cushion, cards, budgets, bills, habit</span>
        </span>
        <ChevronRight size={18} className="text-muted" aria-hidden />
      </Link>

      <SectionTitle>Money</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Tile href="/cards" icon={CreditCard} color="#f97316" title="Cards" sub={cards.length ? <><Amount value={cardDue} /> outstanding</> : "Add a credit card"} />
        <Tile href="/friends" icon={Users} color="#22c55e" title="Friends" sub={owed ? <><Amount value={owed} /> owed to you</> : "All settled"} />
        <Tile href="/plan/goals" icon={Target} color="#a855f7" title="Goals" sub={activeGoals.length ? `${activeGoals.length} active · ${goalPct}% avg` : "Start saving for something"} />
        <Tile href="/plan/recurring" icon={Repeat} color="#3b82f6" title="Bills & rent" sub={due ? `${due} due in 30 days` : "Nothing due soon"} />
        <Tile href="/trips" icon={Plane} color="#06b6d4" title="Trips" sub={d.trips.length ? `${d.trips.filter((t) => !t.archived && t.end_date >= today).length} planned or on` : "Budget a trip, auto-tag spends"} />
        <Tile href="/invest" icon={Rocket} color="#ec4899" title="IPO tracker" sub={sts.holds ? <><Amount value={sts.holds} /> blocked</> : "Apply → allot → list"} />
        <Tile href="/invest/portfolio" icon={TrendingUp} color="#14b8a6" title="Portfolio" sub={`${d.holdings.length} holding${d.holdings.length === 1 ? "" : "s"}`} />
      </div>

      <SectionTitle>Insights</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Tile href="/review" icon={Flame} color="#f59e0b" title="Your progress" sub={`${streak.current}-day streak · ${earned} badges`} />
        <Tile href="/reports" icon={ChartColumn} color="#6366f1" title="Reports" sub="Trends, heatmap, Wrapped" />
        <Tile href="/tax" icon={Receipt} color="#64748b" title="Tax helper" sub="HRA, capital gains, 80C" />
        <Tile href="/notifications" icon={Bell} color="#ef4444" title="Notifications" sub={unread ? `${unread} unread` : "All caught up"} />
      </div>

      <p className="mt-8 text-center text-[11px] text-muted">Paisa OS · your money, one honest number</p>
    </div>
  );
}

function Tile({ href, icon: I, color, title, sub }: { href: string; icon: LucideIcon; color: string; title: string; sub: ReactNode }) {
  return (
    <Link href={href} className="block rounded-3xl border border-line bg-surface p-3.5 shadow-card transition active:scale-[0.98]">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
        <I size={20} aria-hidden />
      </span>
      <p className="mt-3 text-[15px] font-semibold">{title}</p>
      <p className="truncate text-xs text-muted">{sub}</p>
    </Link>
  );
}
