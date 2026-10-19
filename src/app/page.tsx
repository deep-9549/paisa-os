"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TxnDetailSheet } from "@/components/TxnDetail";
import { TxnRow } from "@/components/TxnRow";
import { Amount, Avatar, Badge, Button, Card, Empty, Progress, Ring, Row, SectionTitle, Sheet } from "@/components/ui";
import { envelopes } from "@/lib/domain/budgets";
import { addDays, diffDays, fmtDate, relativeDay } from "@/lib/domain/dates";
import { anomalies } from "@/lib/domain/insights";
import { isLive, txnDate } from "@/lib/domain/ledger";
import { formatINR } from "@/lib/domain/money";
import { occurrencesInRange } from "@/lib/domain/recurring";
import { contribute, getProfile, updateProfile } from "@/lib/store/actions";
import { useCardSummaries, useCycle, useData, useFriendBalances, usePrevCycle, useSafeToSpend, useToday } from "@/lib/store/selectors";
import { useStore } from "@/lib/store/store";
import { recentCycles } from "@/lib/domain/cycle";
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
  const setQuickAdd = useStore((s) => s.setQuickAdd);
  const syncStatus = useStore((s) => s.syncStatus);
  const [breakdown, setBreakdown] = useState(false);
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
    () => anomalies(d.transactions, d.categories, recentCycles(today, 4, p.cycle_history), today).slice(0, 3),
    [d, today, p.cycle_history],
  );

  const used = sts.income > 0 ? 1 - Math.max(sts.month, 0) / Math.max(sts.income - sts.buffer, 1) : 0;
  const tone = sts.month < 0 ? "over" : sts.todayOverBy > 0 || used > 0.8 ? "warn" : "ok";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const isLastDays = diffDays(cycle.end, today) <= 2;

  if (!d.accounts.length) return <Empty icon="🪙" title="No accounts yet" body="Finish setup to see your Safe-to-Spend." action={<Link href="/onboarding" className="text-accent">Start setup →</Link>} />;

  return (
    <div>
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-sm text-muted">{greeting}, {p.name}</p>
          <p className="text-xs text-muted">
            {fmtDate(cycle.start)} – {fmtDate(cycle.end)} · {sts.daysLeft} day{sts.daysLeft > 1 ? "s" : ""} left
            {syncStatus !== "local" && <> · {syncStatus === "synced" ? "☁︎ synced" : syncStatus === "offline" ? "offline – queued" : syncStatus}</>}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button className="flex h-11 w-11 items-center justify-center rounded-full text-lg hover:bg-surface-2" onClick={() => updateProfile({ privacy_mode: !p.privacy_mode })} aria-label={p.privacy_mode ? "Show amounts" : "Hide amounts"} aria-pressed={p.privacy_mode}>
            {p.privacy_mode ? "🙈" : "👁️"}
          </button>
          <Link href="/notifications" className="relative flex h-11 w-11 items-center justify-center rounded-full text-lg hover:bg-surface-2" aria-label={`Notifications, ${unread} unread`}>
            🔔
            {unread > 0 && <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-bad px-1 text-center text-[10px] font-bold text-white">{unread}</span>}
          </Link>
        </div>
      </header>

      {/* Safe-to-Spend */}
      <section className="mt-4 flex flex-col items-center rounded-3xl border border-line bg-surface px-4 pb-4 pt-6" aria-label="Safe to spend">
        <button onClick={() => setBreakdown(true)} aria-label="Show Safe-to-Spend breakdown">
          <Ring value={1 - used} tone={tone} size={208}>
            <span className="text-xs text-muted">Today you can spend</span>
            <span className="mt-1 text-4xl font-bold tracking-tight">
              <Amount value={sts.todayLeft} />
            </span>
            {sts.todayOverBy > 0 ? (
              <span className="mt-1 text-xs font-medium text-bad">over by {formatINR(Math.round(sts.todayOverBy))}</span>
            ) : (
              <span className="mt-1 text-xs text-muted">of {formatINR(Math.round(sts.dailyAllowance))}/day</span>
            )}
          </Ring>
        </button>
        <div className="mt-4 grid w-full grid-cols-3 gap-2 text-center">
          <button onClick={() => setBreakdown(true)} className="rounded-2xl bg-surface-2 p-2.5">
            <p className="text-[11px] text-muted">Left this month</p>
            <p className={`text-base font-semibold ${sts.month < 0 ? "text-bad" : ""}`}><Amount value={sts.month} /></p>
          </button>
          <div className="rounded-2xl bg-surface-2 p-2.5">
            <p className="text-[11px] text-muted">This week</p>
            <p className="text-base font-semibold"><Amount value={sts.weekLeft} /></p>
          </div>
          <Link href="/cards" className="rounded-2xl bg-surface-2 p-2.5">
            <p className="text-[11px] text-muted">True cash</p>
            <p className={`text-base font-semibold ${sts.trueCash < 0 ? "text-bad" : ""}`}><Amount value={sts.trueCash} /></p>
          </Link>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted">True cash = bank {formatINR(sts.liquid)} − card dues {formatINR(sts.cardOutstanding)}{sts.holds > 0 && ` − IPO holds ${formatINR(sts.holds)}`}</p>
      </section>

      {sts.expectedSalary > 0 && (
        <Card className="mt-3 border-info/40 bg-info/5">
          <p className="text-sm">💼 Using expected salary {formatINR(sts.expectedSalary)} until it lands.</p>
          <Button size="sm" className="mt-2" onClick={() => setQuickAdd({ open: true, text: `${sts.expectedSalary} salary` })}>Salary arrived</Button>
        </Card>
      )}

      {drafts.length > 0 && (
        <Card href="/activity?drafts=1" className="mt-3 border-warn/40">
          <p className="text-sm">🕐 {drafts.length} recurring payment{drafts.length > 1 ? "s" : ""} to confirm</p>
        </Card>
      )}

      {insights.map((a) => (
        <Card key={a.id} href="/reports" className="mt-3">
          <p className="text-sm font-medium">{a.title}</p>
          <p className="text-xs text-muted">{a.body}</p>
        </Card>
      ))}

      {isLastDays && sts.month > 0 && d.goals.some((g) => !g.archived) && (
        <Card className="mt-3 border-good/40">
          <p className="text-sm">🎉 {formatINR(sts.month)} left with {sts.daysLeft} day(s) to go. Move some to a goal?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {d.goals.filter((g) => !g.archived).slice(0, 3).map((g) => (
              <Button key={g.id} size="sm" onClick={() => contribute(g.id, Math.floor(sts.month / 2), "leftover")}>
                {g.emoji} {formatINR(Math.floor(sts.month / 2))} → {g.name}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Today */}
      <SectionTitle action={<Link href="/activity" className="text-xs text-accent">All activity</Link>}>
        Today · <Amount value={sts.spentToday} />
      </SectionTitle>
      <Card className="p-1.5">
        {todays.length ? todays.slice(0, 5).map((t) => <TxnRow key={t.id} t={t} onClick={() => setOpenTxn(t)} />) : (
          <button onClick={() => setQuickAdd({ open: true })} className="w-full py-6 text-center text-sm text-muted">Nothing logged today. Tap to add →</button>
        )}
      </Card>

      {/* Upcoming 7 days */}
      <SectionTitle action={<Link href="/plan/recurring" className="text-xs text-accent">Calendar</Link>}>Next 7 days</SectionTitle>
      <Card className="p-1.5">
        {upcoming.length === 0 && cards.every((c) => !c.nextDue || diffDays(c.nextDue.date, today) > 7) ? (
          <p className="py-4 text-center text-sm text-muted">No payments due this week.</p>
        ) : (
          <>
            {cards.filter((c) => c.nextDue && c.nextDue.amount > 0 && diffDays(c.nextDue.date, today) <= 7).map((c) => (
              <Row key={c.card.account_id} href={`/cards/${c.card.account_id}`} left="💳" title={`${c.account.name} bill`} sub={relativeDay(c.nextDue!.date, today)} right={<Amount value={c.nextDue!.amount} className="font-semibold" />} />
            ))}
            {upcoming.map((o) => (
              <Row key={`${o.rule.id}-${o.date}`} href="/plan/recurring" left={o.rule.kind === "rent" ? "🏠" : o.rule.kind === "salary" ? "💼" : o.rule.kind === "sip" ? "📈" : "🧾"} title={o.rule.name} sub={`${relativeDay(o.date, today)}${o.rule.auto_post ? " · auto" : ""}`} right={<Amount value={o.rule.txn_type === "income" ? o.amount : -o.amount} className="font-medium" tone={o.rule.txn_type === "income" ? "good" : undefined} />} />
            ))}
          </>
        )}
      </Card>

      {/* Cards */}
      {cards.length > 0 && (
        <>
          <SectionTitle action={<Link href="/cards" className="text-xs text-accent">Cards</Link>}>Card dues</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {cards.map((c) => (
              <Card key={c.card.account_id} href={`/cards/${c.card.account_id}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{c.account.name} ••{c.card.last4}</p>
                  {c.nextDue && <Badge tone={diffDays(c.nextDue.date, today) < 0 ? "bad" : diffDays(c.nextDue.date, today) <= 5 ? "warn" : "neutral"}>due {relativeDay(c.nextDue.date, today)}</Badge>}
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-muted">Unbilled</span>
                  <Amount value={c.unbilled} />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Statement due</span>
                  <Amount value={c.billedDue} />
                </div>
                <div className="mt-2"><Progress value={c.utilisation} tone={c.utilisation > 0.3 ? "warn" : "ok"} label="Card utilisation" /></div>
                <p className="mt-1 text-[11px] text-muted">{Math.round(c.utilisation * 100)}% utilised · {formatINR(c.available)} available</p>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Budgets */}
      {env.length > 0 && (
        <>
          <SectionTitle action={<Link href="/plan" className="text-xs text-accent">Budgets</Link>}>Budget pace</SectionTitle>
          <Card>
            <div className="space-y-3">
              {env.slice(0, 6).map((e) => (
                <Link key={e.line.id} href={`/activity?cat=${e.line.category_id}`} className="block">
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{e.category?.icon} {e.category?.name}</span>
                    <span className="text-muted"><Amount value={e.spent} /> / <Amount value={e.budget} /></span>
                  </div>
                  <Progress value={e.pct} tone={e.status} marker={e.elapsed} label={e.label} />
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* IPO holds + friends */}
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Card href="/invest">
          <p className="text-xs text-muted">Active IPO holds</p>
          <p className="mt-0.5 text-lg font-semibold"><Amount value={sts.holds} /></p>
          <p className="text-xs text-muted">
            {activeHolds.length ? activeHolds.map((h) => d.ipo_applications.find((a) => a.id === h.ipo_application_id)?.company).filter(Boolean).join(", ") : "No funds blocked"}
          </p>
        </Card>
        <Card href="/friends">
          <p className="text-xs text-muted">Friends</p>
          <div className="mt-0.5 flex items-baseline gap-3">
            <span className="text-lg font-semibold text-good"><Amount value={owedToMe} /></span>
            <span className="text-xs text-muted">owed to you</span>
          </div>
          <p className="text-xs text-muted">You owe <Amount value={iOwe} /> · not counted in Safe-to-Spend</p>
          <div className="mt-2 flex -space-x-2">
            {[...friendBal].filter(([, v]) => Math.abs(v) > 0).slice(0, 5).map(([id]) => {
              const f = d.friends.find((x) => x.id === id);
              return f ? <Avatar key={id} name={f.name} color={f.color} size={28} /> : null;
            })}
          </div>
        </Card>
      </div>

      <BreakdownSheet open={breakdown} onClose={() => setBreakdown(false)} />
      <TxnDetailSheet txn={openTxn} onClose={() => setOpenTxn(null)} />
    </div>
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
        {lines.map((l) => (
          <Link key={l.label} href={l.href ?? "#"} onClick={onClose} className="flex min-h-11 items-center justify-between rounded-lg px-2 hover:bg-surface-2">
            <span className="text-sm">
              {l.label}
              {l.sub && <span className="block text-xs text-muted">{l.sub}</span>}
            </span>
            <Amount value={l.value} className="text-sm font-medium" sign />
          </Link>
        ))}
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
        <p className="px-2 pt-2 text-xs text-muted">
          Card swipes count on the day you spend, so bill payments are transfers and never counted twice. Money friends owe you is excluded until it&apos;s received.
        </p>
      </div>
    </Sheet>
  );
}
