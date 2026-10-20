"use client";

import { ArrowRight, CornerDownLeft, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ASK_SUGGESTIONS, ask } from "@/lib/domain/ask";
import { formatINR } from "@/lib/domain/money";
import { tripSummary } from "@/lib/domain/trips";
import { useCardSummaries, useCashForecast, useCycle, useData, useFriendBalances, useHealth, useNetWorth, usePrevCycle, useSafeToSpend, useToday } from "@/lib/store/selectors";
import { useStore } from "@/lib/store/store";
import type { Transaction } from "@/lib/types";
import { TxnDetailSheet } from "./TxnDetail";
import { TxnRow } from "./TxnRow";
import { Chip, Sheet, cn } from "./ui";

const PAGES = [
  { href: "/", label: "Home", keys: "home safe spend today" },
  { href: "/activity", label: "Activity", keys: "transactions history search" },
  { href: "/cards", label: "Credit cards", keys: "cards bill statement" },
  { href: "/plan", label: "Budgets", keys: "plan budget envelopes" },
  { href: "/plan/recurring", label: "Bills & recurring", keys: "rent subscriptions recurring bills calendar" },
  { href: "/plan/goals", label: "Goals", keys: "savings goals emergency" },
  { href: "/friends", label: "Friends", keys: "split owe settle" },
  { href: "/invest", label: "IPO tracker", keys: "ipo invest allotment" },
  { href: "/invest/portfolio", label: "Net worth & portfolio", keys: "portfolio stocks mf net worth" },
  { href: "/reports", label: "Reports", keys: "reports insights trends wrapped" },
  { href: "/review", label: "Your progress", keys: "streak badges review weekly habit challenge" },
  { href: "/health", label: "Money health score", keys: "health score savings rate emergency fund" },
  { href: "/plan/cashflow", label: "Cash flow forecast", keys: "cash flow balance forecast run short low" },
  { href: "/trips", label: "Trips", keys: "trip travel holiday vacation abroad currency" },
  { href: "/catch-up", label: "Catch up from SMS", keys: "sms import paste bank messages catch up missed" },
  { href: "/tax", label: "Tax helper", keys: "tax hra 80c capital gains" },
  { href: "/notifications", label: "Notifications", keys: "alerts reminders" },
  { href: "/settings", label: "Settings", keys: "settings accounts categories pin export backup theme" },
];

export function AskSheet() {
  const open = useStore((s) => s.askOpen);
  const set = useStore((s) => s.set);
  const close = () => set({ askOpen: false });

  // ⌘K / Ctrl+K anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        set({ askOpen: !useStore.getState().askOpen });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [set]);

  return (
    <Sheet open={open} onClose={close} title="Ask Paisa" wide>
      {open && <AskBody onClose={close} />}
    </Sheet>
  );
}

function AskBody({ onClose }: { onClose: () => void }) {
  const d = useData();
  const today = useToday();
  const cycle = useCycle();
  const prevCycle = usePrevCycle(cycle);
  const sts = useSafeToSpend();
  const balances = useFriendBalances();
  const nw = useNetWorth();
  const cards = useCardSummaries();
  const cash = useCashForecast(35);
  const health = useHealth();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [openTxn, setOpenTxn] = useState<Transaction | null>(null);

  const ctx = useMemo(
    () => ({
      today, cycle, prevCycle, txns: d.transactions, categories: d.categories, friends: d.friends, friendBalances: balances,
      safe: { month: sts.month, todayLeft: sts.todayLeft, dailyAllowance: sts.dailyAllowance, daysLeft: sts.daysLeft, trueCash: sts.trueCash },
      netWorth: nw.total,
      cards: cards.map((c) => ({ name: c.account.name, due: c.nextDue?.amount ?? 0, dueDate: c.nextDue?.date ?? null, unbilled: c.unbilled, href: `/cards/${c.card.account_id}` })),
      cash: { low: cash.low.balance, lowDate: cash.low.date, shortfallDate: cash.shortfall?.date ?? null },
      health: { score: health.score, grade: health.grade, weakest: [...health.factors].filter((f) => (1 - (f.score ?? 1)) * f.weight >= 1).sort((a, b) => (1 - (b.score ?? 1)) * b.weight - (1 - (a.score ?? 1)) * a.weight)[0]?.label ?? null },
      trips: d.trips.map((t) => ({ name: t.name, tag: t.tag, budget: t.budget, spent: tripSummary(t, d.transactions, d.categories, today).spent, href: "/trips" })),
    }),
    [today, cycle, prevCycle, d, balances, sts, nw.total, cards, cash, health],
  );
  const answer = useMemo(() => (q.trim() ? ask(q, ctx) : null), [q, ctx]);
  const needle = q.trim().toLowerCase();
  const pages = needle ? PAGES.filter((p) => `${p.label} ${p.keys}`.toLowerCase().includes(needle)).slice(0, 4) : [];
  const max = Math.max(...(answer?.breakdown?.map((b) => Math.abs(b.value)) ?? [1]), 1);

  return (
    <div className="min-h-[50dvh]">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pages.length && (!answer || answer.kind === "none")) {
              router.push(pages[0].href);
              onClose();
            }
          }}
          placeholder="Food this month · can I afford 3000 · go to cards"
          aria-label="Ask about your money"
          className="h-13 w-full rounded-2xl border border-line bg-surface-2 pl-11 pr-3 text-base outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
          enterKeyHint="search"
        />
      </div>

      {!needle && (
        <>
          <p className="mb-2 mt-4 text-xs font-medium text-muted">Try asking</p>
          <div className="flex flex-wrap gap-2">
            {ASK_SUGGESTIONS.map((s) => (
              <Chip key={s} onClick={() => setQ(s)}>
                <Sparkles size={13} className="text-accent" aria-hidden /> {s}
              </Chip>
            ))}
          </div>
          <p className="mb-1 mt-5 text-xs font-medium text-muted">Jump to</p>
          <div className="grid grid-cols-2 gap-1">
            {PAGES.slice(1, 9).map((p) => (
              <Link key={p.href} href={p.href} onClick={onClose} className="flex h-10 items-center justify-between rounded-xl px-2 text-sm hover:bg-surface-2">
                {p.label} <ArrowRight size={14} className="text-muted" aria-hidden />
              </Link>
            ))}
          </div>
        </>
      )}

      {answer && (
        <div className="mt-4 rounded-3xl border border-line bg-surface-2 p-4 animate-rise" aria-live="polite">
          <p className={cn("text-xl font-bold tracking-tight", answer.tone === "good" && "text-good", answer.tone === "bad" && "text-bad", answer.tone === "warn" && "text-warn")}>{answer.title}</p>
          <p className="mt-1 text-sm text-muted">{answer.text}</p>
          {answer.breakdown && answer.breakdown.length > 0 && (
            <div className="mt-3 space-y-2">
              {answer.breakdown.map((b) => (
                <div key={b.label}>
                  <div className="flex justify-between text-sm">
                    <span>{b.icon} {b.label}</span>
                    <span className={cn("font-semibold tabular", b.value < 0 && "text-bad")}>{formatINR(b.value)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(Math.abs(b.value) / max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {answer.href && (
            <Link href={answer.href} onClick={onClose} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
              Open <ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </div>
      )}

      {answer?.txns && answer.txns.length > 0 && (
        <div className="mt-3 rounded-3xl border border-line bg-surface p-1">
          {answer.txns.map((t) => <TxnRow key={t.id} t={t} onClick={() => setOpenTxn(t)} />)}
        </div>
      )}

      {pages.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-muted">Pages</p>
          {pages.map((p, i) => (
            <Link key={p.href} href={p.href} onClick={onClose} className="flex h-11 items-center justify-between rounded-xl px-2 text-sm hover:bg-surface-2">
              {p.label}
              {i === 0 && (!answer || answer.kind === "none") ? <CornerDownLeft size={14} className="text-muted" aria-hidden /> : <ArrowRight size={14} className="text-muted" aria-hidden />}
            </Link>
          ))}
        </div>
      )}
      <p className="mt-5 text-center text-[11px] text-muted">Answered on your device — nothing leaves your phone.</p>
      <TxnDetailSheet txn={openTxn} onClose={() => setOpenTxn(null)} />
    </div>
  );
}
