"use client";

// Client-side mirror of the pg_cron jobs (PRD section 7). They run on app open
// and every few minutes, are idempotent (deterministic ids), and log to job_runs.
// When Supabase is configured the same jobs also run server-side via pg_cron.

import { envelopes } from "../domain/budgets";
import { getCycle, previousCycle } from "../domain/cycle";
import { addDays, diffDays, fmtDate, istDate, istParts } from "../domain/dates";
import { balanceSince } from "../domain/friends";
import { streakInfo, trackedDays } from "../domain/habits";
import { netWorth } from "../domain/insights";
import { ipoReminders } from "../domain/ipo";
import { isLive, spendInRange, txnDate } from "../domain/ledger";
import { formatINR } from "../domain/money";
import { dueToPost, occurrencesInRange, periodDays } from "../domain/recurring";
import type { AppNotification, Tables } from "../types";
import { del, getProfile, occurrenceTxn, postEmiCharges, purgeTrash, up } from "./actions";
import { cardSummaries, cashForecastFor, salaryDates, safeToSpendFor } from "./selectors";
import { type Change, getData, nowIso, uid, useStore } from "./store";

function notif(id: string, kind: string, title: string, body: string, href: string | null = null): AppNotification {
  return { id, kind, title, body, href, created_at: nowIso(), read: false };
}

export function runJobs(now = new Date()) {
  const d = getData();
  const p = getProfile(d);
  if (!p.onboarded) return;
  const today = istDate(now);
  const { hour, weekday } = istParts(now);
  const changes: Change[] = [];
  const newNotifs: AppNotification[] = [];
  const has = (id: string) => d.notifications.some((n) => n.id === id) || newNotifs.some((n) => n.id === id);
  const push = (n: AppNotification) => {
    if (!has(n.id)) newNotifs.push(n);
  };
  const ran = (job: string, result: string) => changes.push(up("job_runs", { id: `${job}:${today}`, job, ran_at: nowIso(), result }));

  // --- post_recurring (06:00): auto-post or create confirm-drafts ---
  let posted = 0, drafts = 0;
  for (const o of dueToPost(d.recurring_rules, d.transactions, today)) {
    const half = Math.floor(periodDays(o.rule) / 2);
    const pendingDraft = d.transactions.some(
      (t) => t.recurring_rule_id === o.rule.id && Math.abs(diffDays(txnDate(t), o.date)) <= half,
    );
    if (pendingDraft) continue;
    const t = occurrenceTxn(o.rule, o.date, o.amount, !o.rule.auto_post);
    changes.push(up("transactions", t));
    if (o.rule.auto_post) {
      posted++;
      push(notif(`rec-posted-${o.rule.id}-${o.date}`, "recurring", `${o.rule.name} auto-posted`, `${formatINR(o.amount)} on ${fmtDate(o.date)}.`, "/plan/recurring"));
    } else {
      drafts++;
      push(notif(`rec-confirm-${o.rule.id}-${o.date}`, "recurring", `Confirm ${o.rule.name}`, `${formatINR(o.amount)} was due ${fmtDate(o.date)}. Tap to confirm the amount.`, "/activity?drafts=1"));
    }
  }
  ran("post_recurring", `posted ${posted}, drafts ${drafts}`);

  // --- EMI interest postings ---
  changes.push(...postEmiCharges(today));

  // --- close_card_cycles (00:15): snapshot statements ---
  const cards = cardSummaries(d, today);
  let closed = 0;
  for (const c of cards) {
    c.statements.forEach((s, idx) => {
      const row = d.card_cycles.find((r) => r.card_id === c.card.account_id && r.start_date === s.start);
      if (!row) {
        closed++;
        changes.push(up("card_cycles", {
          id: uid(), card_id: c.card.account_id, start_date: s.start, end_date: s.end, status: "closed", total_due: s.total,
          min_due: s.min_due, min_due_override: null, due_date: s.due_date, amount_paid: s.paid,
        }));
        if (idx === c.statements.length - 1 && s.total > 0)
          push(notif(`stmt-${c.card.account_id}-${s.end}`, "card", `Statement ${formatINR(s.total)} due ${fmtDate(s.due_date)}`, `${c.account.name} · minimum ${formatINR(s.min_due)}.`, `/cards/${c.card.account_id}`));
      } else if (row.amount_paid !== s.paid) {
        changes.push(up("card_cycles", { ...row, amount_paid: s.paid }));
      }
    });
    // Due in 5, 2, 0 days
    if (c.nextDue && c.nextDue.amount > 0) {
      const n = diffDays(c.nextDue.date, today);
      if ([5, 2, 0].includes(n))
        push(notif(`due-${c.card.account_id}-${c.nextDue.date}-${n}`, "card", n === 0 ? `${c.account.name} bill due today` : `${c.account.name} bill due in ${n} days`, `${formatINR(c.nextDue.amount)} due · minimum ${formatINR(c.nextDue.min)}.`, `/cards/${c.card.account_id}`));
      if (n < 0)
        push(notif(`overdue-${c.card.account_id}-${c.nextDue.date}`, "card", `${c.account.name} bill overdue`, `Pay at least ${formatINR(c.nextDue.min)} to avoid more late fees.`, `/cards/${c.card.account_id}`));
    }
    if (c.utilisation > 0.3)
      push(notif(`util-${c.card.account_id}-${c.open.start}`, "card", `${c.account.name} utilisation ${Math.round(c.utilisation * 100)}%`, "Above 30% can hurt your credit score. Consider paying early.", `/cards/${c.card.account_id}`));
  }
  ran("close_card_cycles", `closed ${closed}`);

  // --- reminders (09:00 and 21:00) ---
  const upcoming = occurrencesInRange(d.recurring_rules.filter((r) => r.txn_type !== "income"), d.transactions, today, addDays(today, 2));
  for (const o of upcoming.filter((x) => !x.posted)) {
    const n = diffDays(o.date, today);
    push(notif(`bill-${o.rule.id}-${o.date}-${n}`, "bill", n === 0 ? `${o.rule.name} due today` : `${o.rule.name} due ${n === 1 ? "tomorrow" : `in ${n} days`}`, `${formatINR(o.amount)} · ${fmtDate(o.date)}.`, "/plan/recurring"));
  }
  for (const r of ipoReminders(d.ipo_applications, today, addDays(today, 1))) push(notif(r.id, "ipo", r.title, r.body, "/invest"));
  // Morning briefs are only useful on the day; drop older ones.
  for (const n of d.notifications) if (n.kind === "brief" && n.id !== `morning-${today}`) changes.push(del("notifications", n.id));
  if (p.notify_daily_nudge && hour >= 8 && hour < 12) {
    const sts = safeToSpendFor(d, today);
    push(notif(`morning-${today}`, "brief", `${formatINR(Math.round(sts.todayLeft))} to spend today`, `${formatINR(Math.round(sts.month))} left for ${sts.daysLeft} day${sts.daysLeft === 1 ? "" : "s"} this month.`, "/"));
  }
  if (p.notify_daily_nudge && hour >= 21 && !d.day_logs.some((l) => l.date === today)) {
    const streak = streakInfo(trackedDays(d.transactions, d.day_logs), today);
    const loggedToday = d.transactions.some((t) => isLive(t) && txnDate(t) === today && t.type === "expense");
    push(notif(
      `nudge-${today}`,
      "nudge",
      streak.atRisk ? `Keep your ${streak.current}-day streak 🔥` : loggedToday ? "Close your day" : "Log today's spends?",
      loggedToday ? "Ten seconds: check today's spends and close the day." : "Nothing logged yet today. Add spends or close it as a no-spend day.",
      "/?close=1",
    ));
  }
  const reminderDays = p.friend_reminder_days || 14;
  for (const f of d.friends) {
    const since = balanceSince(f.id, d.transactions, d.transaction_splits, d.settlements);
    if (since && diffDays(today, since) >= reminderDays)
      push(notif(`friend-${f.id}-${since}`, "friend", `Unsettled with ${f.name} for ${diffDays(today, since)} days`, "Send a reminder or settle up.", `/friends/${f.id}`));
  }
  ran("reminders", "ok");

  // --- budget_pace (20:00): warnings at 80% / 100% ---
  const cycle = getCycle(today, p.cycle_history, salaryDates(d));
  const prev = previousCycle(cycle, p.cycle_history, salaryDates(d));
  for (const e of envelopes(d.budget_lines, d.categories, d.transactions, cycle, prev, today)) {
    const name = e.category?.name ?? "Category";
    if (e.pct >= 1) push(notif(`pace100-${e.line.id}-${cycle.start}`, "budget", `${name} budget used up`, `${formatINR(e.spent)} of ${formatINR(e.budget)}.`, "/plan"));
    else if (e.pct >= 0.8) push(notif(`pace80-${e.line.id}-${cycle.start}`, "budget", `${name} at ${Math.round(e.pct * 100)}%`, `${formatINR(e.budget - e.spent)} left with ${diffDays(cycle.end, today) + 1} days to go.`, "/plan"));
  }
  if (cycle.end === today) push(notif(`monthend-${cycle.start}`, "report", "Last day of the budget month", "See where the money went and move leftovers to a goal.", "/reports"));
  ran("budget_pace", "ok");

  // --- low balance ahead: warn a week before the bank would run short ---
  const cash = cashForecastFor(d, today, 21);
  if (cash.shortfall && diffDays(cash.shortfall.date, today) <= 7) {
    const hit = cash.events.find((e) => e.date === cash.shortfall!.date && e.amount < 0);
    push(notif(
      `shortfall-${cash.shortfall.date}`,
      "cash",
      `Bank balance may run short on ${fmtDate(cash.shortfall.date)}`,
      `${hit ? `${hit.label} (${formatINR(-hit.amount)}) is due then. ` : ""}Projected low ${formatINR(Math.round(cash.low.balance))}. Move money in or hold off big spends.`,
      "/plan/cashflow",
    ));
  }

  // --- snapshot_net_worth (23:55) ---
  const nw = netWorth(d.accounts, d.transactions, d.settlements, d.holdings, d.transaction_splits);
  const snap = d.net_worth_snapshots.find((s) => s.id === today);
  if (!snap || snap.value !== nw.total) changes.push(up("net_worth_snapshots", { id: today, date: today, value: nw.total }));

  // --- weekly_digest (Sunday 10:00) ---
  if (p.notify_weekly && weekday === 0 && hour >= 10) {
    const spent = spendInRange(d.transactions, addDays(today, -6), today);
    const sts = safeToSpendFor(d, today);
    push(notif(`weekly-${today}`, "digest", `This week: ${formatINR(spent)} spent`, `${formatINR(sts.month)} left this month · ${formatINR(sts.dailyAllowance)}/day.`, "/reports"));
  }

  // Commit notifications + changes, then show system notifications.
  for (const n of newNotifs) changes.push(up("notifications", n));
  if (changes.length) useStore.getState().commit(changes);
  if (newNotifs.length) showSystemNotifications(newNotifs);
  purgeTrash(today);
}

async function showSystemNotifications(list: AppNotification[]) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker?.getRegistration();
  for (const n of list.slice(0, 3)) {
    const opts = { body: n.body, tag: n.id, data: { href: n.href ?? "/" }, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" };
    if (reg) reg.showNotification(n.title, opts);
    else new Notification(n.title, opts);
  }
}

export const tablesHaveData = (d: Tables) => d.accounts.length > 0;
