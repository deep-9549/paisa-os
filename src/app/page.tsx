"use client";

import { Bell, CalendarClock, ChevronRight, CreditCard, Eye, EyeOff, HardDriveDownload, Info, Landmark, Lightbulb, Plus, Rocket, Search, Sparkles, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ChallengeCard, CloseDayCard, CloseDaySheet, StreakPill, WeekStrip } from "@/components/Habit";
import { GettingStarted } from "@/components/GettingStarted";
import { SpottedCard, useSpotted } from "@/components/Spotted";
import { TxnDetailSheet } from "@/components/TxnDetail";
import { TxnRow } from "@/components/TxnRow";
import { Amount, Avatar, Button, Card, Empty, IconButton, Progress, SectionTitle, Sheet, cn } from "@/components/ui";
import { envelopes } from "@/lib/domain/budgets";
import { recentCycles } from "@/lib/domain/cycle";
import { backupNow, lastBackupAt } from "@/lib/data";
import { addDays, diffDays, fmtDate, istDate, relativeDay } from "@/lib/domain/dates";
import { anomalies, forecastMonthEnd } from "@/lib/domain/insights";
import { isLive, txnDate } from "@/lib/domain/ledger";
import { formatINR } from "@/lib/domain/money";
import { occurrencesInRange } from "@/lib/domain/recurring";
import { contribute, getProfile, updateProfile } from "@/lib/store/actions";
import { useCardSummaries, useCashForecast, useCycle, useData, useFrequent, useFriendBalances, useLookups, usePrevCycle, useSafeToSpend, useToday } from "@/lib/store/selectors";
import { useStore } from "@/lib/store/store";
import type { Transaction } from "@/lib/types";

export default function Home() {
  const d = useData();
  const p = getProfile(d);
  const today = useToday();
  const sts = useSafeToSpend();
  const cycle = useCycle();
  const prev = usePrevCycle(cycle);
  const cards = useCardSummaries();
  const friendBal = useFriendBalances();
  const frequent = useFrequent(8);
  const { cat } = useLookups();
  const setQuickAdd = useStore((s) => s.setQuickAdd);
  const syncStatus = useStore((s) => s.syncStatus);
  const [breakdown, setBreakdown] = useState(false);
  const [closing, setClosing] = useState(false);
  const [spotted, dismissSpotted] = useSpotted();
  const cash = useCashForecast(35);
  const userId = useStore((s) => s.userId);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  useEffect(() => setLastBackup(lastBackupAt()), []);
  // Local-only data with no backup in 30 days (and enough to lose) gets a nudge.
  const needsBackup = !userId && d.transactions.length >= 20 && (!lastBackup || diffDays(today, istDate(lastBackup)) >= 30);
  // Deep link from the evening notification: /?close=1
  useEffect(() => {
    if (new URLSearchParams(location.search).get("close") === "1") {
      setClosing(true);
      history.replaceState(null, "", "/");
    }
  }, []);
  const [openTxn, setOpenTxn] = useState<Transaction | null>(null);
  const unread = d.notifications.filter((n) => !n.read).length;

  const upcoming = useMemo(
    () => occurrencesInRange(d.recurring_rules, d.transactions, today, addDays(today, 7)).filter((o) => !o.posted),
    [d, today],
  );
  const env = useMemo(() => envelopes(d.budget_lines, d.categories, d.transactions, cycle, prev, today), [d, cycle, prev, today]);
  const activeHolds = d.holds.filter((h) => h.status === "active");
  const owedToMe = [...friendBal.values()].filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const iOwe = [...friendBal.values()].filter((v) => v < 0).reduce((a, b) => a - b, 0);
  const todays = d.transactions.filter((t) => isLive(t) && txnDate(t) === today).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const drafts = d.transactions.filter((t) => t.is_draft && !t.deleted_at);
  const insights = useMemo(
    () => anomalies(d.transactions, d.categories, recentCycles(today, 4, p.cycle_history), today).slice(0, 2),
    [d, today, p.cycle_history],
  );

  const budgetBase = Math.max(sts.income - sts.buffer, 1);
  const used = sts.income > 0 ? 1 - Math.max(sts.month, 0) / budgetBase : 0;
  const elapsed = Math.min(1, (cycle.length - sts.daysLeft + 1) / cycle.length);
  const tone = sts.month < 0 ? "over" : sts.todayOverBy > 0 || used > elapsed + 0.1 ? "warn" : "ok";
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  const greeting = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const isLastDays = diffDays(cycle.end, today) <= 2;
  const dueCards = cards.filter((c) => c.nextDue && c.nextDue.amount > 0 && diffDays(c.nextDue.date, today) <= 7);
  // Projected leftover: what's left now minus the routine run-rate for the remaining days.
  const forecast = useMemo(() => forecastMonthEnd(d.transactions, cycle, today, 0), [d.transactions, cycle, today]);
  const paceEnd = sts.month - forecast.runRate * Math.max(sts.daysLeft - 1, 0) - sts.variableUpcoming;
  const todayPct = sts.dailyAllowance > 0 ? Math.min(sts.spentToday / sts.dailyAllowance, 1) : sts.spentToday > 0 ? 1 : 0;

  if (!d.accounts.length) return <Empty icon={<Wallet />} title="No accounts yet" body="Finish setup to see your Safe-to-Spend." action={<Link href="/onboarding" className="font-semibold text-accent">Start setup →</Link>} />;

  return (
    <div>
      <header className="flex items-center justify-between gap-2 pt-1">
        <div className="min-w-0">
          <p className="truncate text-[22px] font-bold tracking-tight">{greeting}, {p.name.split(" ")[0]}</p>
          <p className="text-xs text-muted">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
            {syncStatus !== "local" && <> · {syncStatus === "synced" ? "synced" : syncStatus === "offline" ? "offline, changes queued" : syncStatus}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <StreakPill />
          <IconButton label="Ask Paisa" onClick={() => useStore.getState().set({ askOpen: true })}>
            <Search size={20} />
          </IconButton>
          <IconButton label={`Notifications, ${unread} unread`} href="/notifications" badge={unread}>
            <Bell size={20} />
          </IconButton>
        </div>
      </header>

      {/* Safe-to-Spend hero */}
      <section className="hero mt-4 overflow-hidden rounded-[28px] border border-line p-5 shadow-card animate-rise" aria-label="Safe to spend">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted">Today you can spend</p>
          <div className="-mr-2 flex items-center">
            <button onClick={() => updateProfile({ privacy_mode: !p.privacy_mode })} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-ink" aria-label={p.privacy_mode ? "Show amounts" : "Hide amounts"} aria-pressed={p.privacy_mode}>
              {p.privacy_mode ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button onClick={() => setBreakdown(true)} className="flex h-9 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted hover:text-ink" aria-label="Show Safe-to-Spend breakdown">
              <Info size={14} aria-hidden /> How?
            </button>
          </div>
        </div>
        <button onClick={() => setBreakdown(true)} className="block text-left" aria-label="Show Safe-to-Spend breakdown">
          <span className={cn("display block text-[56px] leading-none", sts.todayOverBy > 0 && "text-bad")}>
            <Amount value={sts.todayOverBy > 0 ? -sts.todayOverBy : sts.todayLeft} />
          </span>
        </button>
        <p className="mt-2 text-sm text-muted">
          {sts.todayOverBy > 0 ? (
            <span className="font-medium text-bad">Over today&apos;s {formatINR(Math.round(sts.dailyAllowance))} — tomorrow adjusts</span>
          ) : (
            <>
              <Amount value={sts.spentToday} /> spent of <Amount value={sts.dailyAllowance} /> today
            </>
          )}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden>
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${todayPct * 100}%`, background: sts.todayOverBy > 0 ? "var(--bad)" : todayPct > 0.8 ? "var(--warn)" : "var(--accent)" }} />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <HeroStat label="Left this month" onClick={() => setBreakdown(true)}>
            <Amount value={sts.month} className={sts.month < 0 ? "text-bad" : undefined} />
          </HeroStat>
          <HeroStat label="This week">
            <Amount value={sts.weekLeft} />
          </HeroStat>
          <HeroStat label="True cash" href="/cards">
            <Amount value={sts.trueCash} className={sts.trueCash < 0 ? "text-bad" : undefined} />
          </HeroStat>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[11px] text-muted">
            <span>{Math.round(used * 100)}% of budget used</span>
            <span>{sts.daysLeft} day{sts.daysLeft === 1 ? "" : "s"} left · ends {fmtDate(cycle.end)}</span>
          </div>
          <Progress value={used} tone={tone} marker={elapsed} label="Budget used versus month elapsed" />
          {sts.daysLeft > 1 && sts.income > 0 && (
            <p className={cn("mt-2 text-xs font-medium", paceEnd >= 0 ? "text-good" : "text-bad")}>
              {paceEnd >= 0 ? `At this pace you'll end the month with ${formatINR(Math.round(paceEnd))} spare` : `At this pace you'll be ${formatINR(Math.round(-paceEnd))} short by month-end`}
            </p>
          )}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          True cash = bank {formatINR(sts.liquid)} − card dues {formatINR(sts.cardOutstanding)}{sts.holds > 0 && ` − IPO holds ${formatINR(sts.holds)}`}
        </p>
      </section>

      {/* One-tap repeats */}
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar" aria-label="Log again">
        <button onClick={() => setQuickAdd({ open: true })} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-ink active:scale-95">
          <Plus size={16} aria-hidden /> Log spend
        </button>
        {frequent.map((f) => (
          <button
            key={f.merchant}
            onClick={() => setQuickAdd({ open: true, text: `${f.amount} ${f.merchant} ${f.method === "card" ? "card" : f.method === "cash" ? "cash" : "upi"}` })}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm font-medium transition active:scale-95"
          >
            <span aria-hidden>{(f.category_id && cat.get(f.category_id)?.icon) || "🧾"}</span>
            {f.merchant}
            <span className="text-muted">{formatINR(f.amount)}</span>
          </button>
        ))}
      </div>

      <CloseDayCard onOpen={() => setClosing(true)} />
      <GettingStarted onCloseDay={() => setClosing(true)} />

      {spotted[0] && (
        <div className="mt-3">
          <SpottedCard c={spotted[0]} onDismiss={() => dismissSpotted(spotted[0].merchant)} />
        </div>
      )}

      {/* For you: things that need a tap */}
      {(sts.expectedSalary > 0 || needsBackup || drafts.length > 0 || insights.length > 0 || (isLastDays && sts.month > 0 && d.goals.some((g) => !g.archived))) && (
        <div className="mt-3 space-y-2">
          {sts.expectedSalary > 0 && (
            <Nudge
              icon={<Wallet size={18} />}
              tone="info"
              title={sts.cappedByCash ? "Salary not recorded this month" : `Counting on salary of ${formatINR(sts.expectedSalary)}`}
              body={sts.cappedByCash ? `Until it is, Safe-to-Spend only uses the cash you actually have (${formatINR(Math.round(sts.trueCash))}).` : "Mark it when it lands so the numbers use real income."}
            >
              <Button size="sm" onClick={() => setQuickAdd({ open: true, text: `${sts.expectedSalary} salary` })}>Arrived</Button>
            </Nudge>
          )}
          {needsBackup && (
            <Nudge icon={<HardDriveDownload size={18} />} tone="warn" title="Back up your data" body={`Everything lives only in this browser${lastBackup ? `; last backup ${fmtDate(istDate(lastBackup))}` : ""}. Save a copy in case you clear it or lose the phone.`}>
              <Button size="sm" onClick={() => { backupNow(today); setLastBackup(new Date().toISOString()); }}>Save backup</Button>
            </Nudge>
          )}
          {drafts.length > 0 && (
            <Nudge href="/activity?drafts=1" icon={<CalendarClock size={18} />} tone="warn" title={`${drafts.length} recurring payment${drafts.length > 1 ? "s" : ""} to confirm`} body="Check the amounts and tap confirm." />
          )}
          {insights.map((a) => (
            <Nudge key={a.id} href="/reports" icon={<Lightbulb size={18} />} tone="accent" title={a.title} body={a.body} />
          ))}
          {isLastDays && sts.month > 0 && d.goals.some((g) => !g.archived) && (
            <Nudge icon={<Sparkles size={18} />} tone="good" title={`${formatINR(sts.month)} left with ${sts.daysLeft} day(s) to go`} body="Move some of it to a goal before the month resets?">
              <div className="flex flex-wrap gap-2">
                {d.goals.filter((g) => !g.archived).slice(0, 2).map((g) => (
                  <Button key={g.id} size="sm" onClick={() => contribute(g.id, Math.floor(sts.month / 2), "leftover")}>
                    {g.emoji} {formatINR(Math.floor(sts.month / 2))}
                  </Button>
                ))}
              </div>
            </Nudge>
          )}
        </div>
      )}

      {/* Today */}
      <SectionTitle action={<Link href="/activity">See all</Link>}>
        Today <span className="ml-1 font-medium text-muted"><Amount value={sts.spentToday} /></span>
      </SectionTitle>
      <Card className="p-1.5">
        {todays.length ? todays.slice(0, 5).map((t) => <TxnRow key={t.id} t={t} onClick={() => setOpenTxn(t)} />) : (
          <button onClick={() => setQuickAdd({ open: true })} className="flex w-full flex-col items-center gap-1 py-6 text-center">
            <span className="text-sm font-medium">Nothing logged today</span>
            <span className="text-xs text-muted">Type “120 chai upi” or paste a bank SMS</span>
          </button>
        )}
        {todays.length > 5 && <Link href={`/activity?day=${today}`} className="block py-2 text-center text-sm font-medium text-accent">+{todays.length - 5} more</Link>}
      </Card>

      {/* This week */}
      <SectionTitle action={<Link href="/review">Weekly review</Link>}>This week</SectionTitle>
      <Card>
        <WeekStrip allowance={sts.dailyAllowance} />
        <div className="mt-4 border-t border-line pt-3">
          <ChallengeCard compact />
        </div>
      </Card>

      {/* Coming up */}
      <SectionTitle action={<Link href="/plan/recurring">Calendar</Link>}>Coming up</SectionTitle>
      <Card className="p-1.5">
        {upcoming.length === 0 && dueCards.length === 0 ? (
          <p className="py-5 text-center text-sm text-muted">Nothing due in the next 7 days.</p>
        ) : (
          <>
            {dueCards.map((c) => (
              <UpRow key={c.card.account_id} href={`/cards/${c.card.account_id}`} icon={<CreditCard size={18} />} tint="var(--warn)" title={`${c.account.name} bill`} sub={relativeDay(c.nextDue!.date, today)} amount={-c.nextDue!.amount} />
            ))}
            {upcoming.map((o) => (
              <UpRow
                key={`${o.rule.id}-${o.date}`}
                href="/plan/recurring"
                icon={<span className="text-base">{o.rule.kind === "rent" ? "🏠" : o.rule.kind === "salary" ? "💼" : o.rule.kind === "sip" ? "📈" : o.rule.kind === "subscription" ? "📺" : "🧾"}</span>}
                title={o.rule.name}
                sub={`${relativeDay(o.date, today)}${o.rule.auto_post ? " · auto" : ""}`}
                amount={o.rule.txn_type === "income" ? o.amount : -o.amount}
                good={o.rule.txn_type === "income"}
              />
            ))}
          </>
        )}
      </Card>

      <Link href="/plan/cashflow" className="mt-2 flex items-center gap-3 rounded-3xl border border-line bg-surface p-3.5 shadow-card transition active:scale-[0.99]">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", cash.shortfall ? "bg-bad/15 text-bad" : "bg-accent/12 text-accent")}>
          <Landmark size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{cash.shortfall ? `Bank runs short on ${fmtDate(cash.shortfall.date)}` : "Lowest bank balance ahead"}</span>
          <span className="block truncate text-xs text-muted">
            {formatINR(Math.round(cash.low.balance))} on {fmtDate(cash.low.date)} · next 5 weeks
          </span>
        </span>
        <Sparkline values={cash.points.map((p) => p.balance)} bad={!!cash.shortfall} />
      </Link>

      {/* Budgets */}
      {env.length > 0 && (
        <>
          <SectionTitle action={<Link href="/plan">All budgets</Link>}>Budgets</SectionTitle>
          <Card>
            <div className="space-y-4">
              {[...env].sort((a, b) => b.pct - a.pct).slice(0, 4).map((e) => (
                <Link key={e.line.id} href={`/activity?cat=${e.line.category_id}`} className="block">
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="font-medium">{e.category?.icon} {e.category?.name}</span>
                    <span className="text-xs text-muted">
                      {e.budget - e.spent >= 0 ? <><Amount value={e.budget - e.spent} /> left</> : <span className="font-medium text-bad"><Amount value={e.spent - e.budget} /> over</span>}
                    </span>
                  </div>
                  <Progress value={e.pct} tone={e.status} marker={e.elapsed} label={e.label} />
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Money around you */}
      <div className="mt-7 grid grid-cols-2 gap-2">
        {cards.length > 0 && (
          <Tile href="/cards" icon={<CreditCard size={16} />} label="Cards">
            <Amount value={cards.reduce((a, c) => a + c.unbilled + c.billedDue, 0)} />
            <span className="block text-[11px] font-normal text-muted">{Math.round(Math.max(...cards.map((c) => c.utilisation)) * 100)}% max utilised</span>
          </Tile>
        )}
        {d.friends.length > 0 && <Tile href="/friends" icon={<Users size={16} />} label="Friends owe you">
          <Amount value={owedToMe} className="text-good" />
          <span className="flex items-center gap-1 text-[11px] font-normal text-muted">
            you owe <Amount value={iOwe} />
            <span className="ml-auto flex -space-x-1.5">
              {[...friendBal].filter(([, v]) => Math.abs(v) > 0).slice(0, 3).map(([id]) => {
                const f = d.friends.find((x) => x.id === id);
                return f ? <Avatar key={id} name={f.name} color={f.color} size={18} /> : null;
              })}
            </span>
          </span>
        </Tile>}
        {(activeHolds.length > 0 || d.ipo_applications.length > 0) && (
          <Tile href="/invest" icon={<Rocket size={16} />} label="IPO holds">
            <Amount value={sts.holds} />
            <span className="block truncate text-[11px] font-normal text-muted">
              {activeHolds.length ? activeHolds.map((h) => d.ipo_applications.find((a) => a.id === h.ipo_application_id)?.company).filter(Boolean).join(", ") : "No funds blocked"}
            </span>
          </Tile>
        )}
      </div>

      <BreakdownSheet open={breakdown} onClose={() => setBreakdown(false)} />
      <CloseDaySheet open={closing} onClose={() => setClosing(false)} />
      <TxnDetailSheet txn={openTxn} onClose={() => setOpenTxn(null)} />
    </div>
  );
}

function HeroStat({ label, children, href, onClick }: { label: string; children: ReactNode; href?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="block text-[11px] text-muted">{label}</span>
      <span className="mt-0.5 block truncate text-[15px] font-bold tabular">{children}</span>
    </>
  );
  const cls = "block min-w-0 rounded-2xl bg-ink/[0.06] px-3 py-2.5 text-left transition active:scale-[0.97]";
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

const TONES = { info: "var(--info)", warn: "var(--warn)", accent: "var(--accent)", good: "var(--good)", bad: "var(--bad)" };

function Nudge({ icon, title, body, tone, href, children }: { icon: ReactNode; title: string; body?: string; tone: keyof typeof TONES; href?: string; children?: ReactNode }) {
  const inner = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${TONES[tone]} 15%, transparent)`, color: TONES[tone] }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {body && <span className="block text-xs text-muted">{body}</span>}
        {children && <span className="mt-2 block">{children}</span>}
      </span>
      {href && <ChevronRight size={18} className="mt-2 shrink-0 text-muted" aria-hidden />}
    </>
  );
  const cls = "flex items-start gap-3 rounded-3xl border border-line bg-surface p-3.5 shadow-card";
  return href ? <Link href={href} className={cn(cls, "transition active:scale-[0.99]")}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

function UpRow({ href, icon, title, sub, amount, tint, good }: { href: string; icon: ReactNode; title: string; sub: string; amount: number; tint?: string; good?: boolean }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-surface-2">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-2" style={tint ? { color: tint, background: `color-mix(in srgb, ${tint} 14%, transparent)` } : undefined}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      <Amount value={amount} className={cn("text-sm font-semibold", good && "text-good")} sign={good} />
    </Link>
  );
}

function Tile({ href, icon, label, children }: { href: string; icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <Link href={href} className="block rounded-3xl border border-line bg-surface p-3.5 shadow-card transition active:scale-[0.98]">
      <span className="flex items-center gap-1.5 text-xs text-muted">{icon}{label}</span>
      <span className="mt-1 block text-lg font-bold tabular">{children}</span>
    </Link>
  );
}

function BreakdownSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sts = useSafeToSpend();
  const lines: { label: string; value: number; href?: string; sub?: string }[] = [
    { label: sts.expectedSalary ? "Income (incl. expected salary)" : "Income this cycle", value: sts.income, href: "/activity?type=income" },
    { label: "Fixed commitments not yet paid", value: -sts.fixedCommitments, href: "/plan/recurring", sub: sts.commitmentItems.map((o) => o.rule.name).join(", ") },
    { label: "Investments & loan EMIs", value: -sts.investments, href: "/invest/portfolio" },
    { label: "Goal reserve", value: -sts.goalReserve, href: "/plan/goals" },
    { label: "Safety buffer", value: -sts.buffer, href: "/settings" },
    { label: "Spent (UPI + card + cash)", value: -sts.spent, href: "/activity" },
    { label: "IPO holds", value: -sts.holds, href: "/invest" },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="How Safe-to-Spend is worked out">
      <div className="space-y-1">
        {lines.filter((l) => l.value !== 0 || l.label.startsWith("Income")).map((l) => (
          <Link key={l.label} href={l.href ?? "#"} onClick={onClose} className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 hover:bg-surface-2">
            <span className="min-w-0 text-sm">
              {l.label}
              {l.sub && <span className="block truncate text-xs text-muted">{l.sub}</span>}
            </span>
            <Amount value={l.value} className="text-sm font-semibold" sign />
          </Link>
        ))}
        {sts.cappedByCash && (
          <p className="mx-2 rounded-xl bg-info/10 p-2.5 text-xs text-info">
            Salary isn&apos;t recorded this month yet, so this is limited to your true cash ({formatINR(sts.trueCash)}) minus unpaid bills.
          </p>
        )}
        <div className="flex items-center justify-between border-t border-line px-2 pt-3">
          <span className="font-semibold">Left this month</span>
          <Amount value={sts.month} className="text-lg font-bold" />
        </div>
        {sts.variableUpcoming > 0 && (
          <div className="flex items-center justify-between px-2 text-sm text-muted">
            <span>Upcoming variable bills (3-mo avg)</span>
            <Amount value={-sts.variableUpcoming} />
          </div>
        )}
        <div className="flex items-center justify-between px-2 text-sm">
          <span>÷ {sts.daysLeft} days left = daily allowance</span>
          <Amount value={sts.dailyAllowance} className="font-semibold" />
        </div>
        <p className="px-2 pt-2 text-xs leading-relaxed text-muted">
          Card swipes count on the day you spend, so bill payments are transfers and never counted twice. Money friends owe you is left out until you actually receive it. Unspent allowance rolls into the days ahead.
        </p>
      </div>
    </Sheet>
  );
}

/** Tiny inline trend line, no axes: shape only (the numbers are in the text). */
function Sparkline({ values, bad }: { values: number[]; bad?: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const w = 72;
  const h = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`).join(" ");
  const zero = h - ((0 - min) / (max - min || 1)) * h;
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible" aria-hidden>
      {min < 0 && <line x1={0} x2={w} y1={zero} y2={zero} stroke="var(--bad)" strokeDasharray="2 2" strokeWidth={1} />}
      <polyline points={pts} fill="none" stroke={bad ? "var(--bad)" : "var(--accent)"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
