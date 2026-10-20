"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SpottedCard, useSpotted } from "@/components/Spotted";
import { PLAN_TABS, SubTabs } from "@/components/PlanTabs";
import { Amount, Badge, Button, Card, Empty, Field, Input, PageHeader, Row, SectionTitle, Segmented, Select, Sheet, Toggle } from "@/components/ui";
import { ordinal } from "@/lib/domain/cycle";
import { addDays, dayHeading, fmtDate, istDate } from "@/lib/domain/dates";
import { formatINR, parseAmount } from "@/lib/domain/money";
import { expectedAmount, isVariable, nextOccurrence, occurrencesInRange, postedFor, yearlyCost } from "@/lib/domain/recurring";
import { fyRange } from "@/lib/domain/tax";
import { categoryPath, deleteRule, newRule, postOccurrence, saveRule } from "@/lib/store/actions";
import { useData, useToday } from "@/lib/store/selectors";
import type { PayMethod, RecurringRule } from "@/lib/types";

const KIND_ICON: Record<string, string> = { rent: "🏠", bill: "🧾", subscription: "📺", salary: "💼", sip: "📈", emi: "🏧", income: "💰", other: "🔁" };

export default function RecurringPage() {
  const d = useData();
  const today = useToday();
  const [tab, setTab] = useState<"upcoming" | "all" | "subs" | "rent">("upcoming");
  const [edit, setEdit] = useState<RecurringRule | "new" | null>(null);
  const [spotted, dismiss] = useSpotted();
  const upcoming = useMemo(() => occurrencesInRange(d.recurring_rules, d.transactions, addDays(today, -10), addDays(today, 35)), [d, today]);
  const subs = d.recurring_rules.filter((r) => r.kind === "subscription");
  const rents = d.recurring_rules.filter((r) => r.kind === "rent");
  const subsYearly = subs.filter((r) => r.active).reduce((a, r) => a + yearlyCost(r), 0);

  return (
    <div>
      <PageHeader title="Plan" subtitle="Rent, bills, subscriptions, salary and SIPs" action={<Button size="sm" onClick={() => setEdit("new")}>+ Recurring</Button>} />
      <SubTabs tabs={PLAN_TABS} />
      <Segmented value={tab} onChange={setTab} options={[{ value: "upcoming", label: "Upcoming" }, { value: "all", label: "All rules" }, { value: "subs", label: "Subscriptions" }, { value: "rent", label: "Rent" }]} />

      {spotted.length > 0 && (
        <div className="mt-4 space-y-2">
          {spotted.slice(0, 3).map((c) => <SpottedCard key={c.merchant} c={c} onDismiss={() => dismiss(c.merchant)} />)}
        </div>
      )}

      {tab === "upcoming" && (
        <div className="mt-4">
          {upcoming.length === 0 && <Empty icon="🗓️" title="Nothing scheduled" body="Add rent, bills and subscriptions so they're reserved on salary day." />}
          {groupByDate(upcoming).map(([date, list]) => (
            <div key={date} className="mb-2">
              <p className="px-2 py-1 text-xs font-semibold text-muted">{dayHeading(date, today)}</p>
              <Card className="p-1">
                {list.map((o) => (
                  <Row
                    key={o.rule.id}
                    left={KIND_ICON[o.rule.kind]}
                    title={<>{o.rule.name} {o.posted ? <Badge tone="good">paid</Badge> : date < today ? <Badge tone="bad">overdue</Badge> : o.rule.auto_post ? <Badge>auto</Badge> : null}</>}
                    sub={`${categoryPath(o.rule.category_id, d.categories)}${isVariable(o.rule) ? " · varies, 3-mo avg" : ""}`}
                    right={
                      <div className="flex items-center gap-2">
                        <Amount value={o.rule.txn_type === "income" ? o.amount : -o.amount} tone={o.rule.txn_type === "income" ? "good" : undefined} className="font-medium" />
                        {!o.posted && date <= addDays(today, 3) && (
                          <Button size="sm" onClick={() => postOccurrence(o.rule, date, o.amount)}>{o.rule.txn_type === "income" ? "Got it" : "Paid"}</Button>
                        )}
                      </div>
                    }
                  />
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}

      {tab === "all" && (
        <Card className="mt-4 p-1">
          {d.recurring_rules.length === 0 && <p className="py-6 text-center text-sm text-muted">No recurring rules yet.</p>}
          {d.recurring_rules.map((r) => {
            const next = nextOccurrence(r, today);
            return (
              <Row
                key={r.id}
                onClick={() => setEdit(r)}
                left={KIND_ICON[r.kind]}
                title={<>{r.name} {!r.active && <Badge>paused</Badge>}</>}
                sub={`${r.frequency} · ${ordinal(r.due_day)}${next ? ` · next ${fmtDate(next)}` : ""}${r.auto_post ? " · auto-post" : " · confirm"}`}
                right={<Amount value={isVariable(r) ? expectedAmount(r, today, d.transactions) : r.amount} className="font-medium" />}
              />
            );
          })}
        </Card>
      )}

      {tab === "subs" && (
        <div className="mt-4">
          <Card>
            <p className="text-xs text-muted">Subscriptions cost you</p>
            <p className="text-2xl font-bold"><Amount value={subsYearly} /> <span className="text-sm font-normal text-muted">a year</span></p>
            <p className="text-xs text-muted">≈ {formatINR(subsYearly / 12)} a month across {subs.filter((s) => s.active).length} active</p>
          </Card>
          <SectionTitle>Subscription audit</SectionTitle>
          <Card className="p-1">
            {subs.length === 0 && <p className="py-6 text-center text-sm text-muted">No subscriptions tracked.</p>}
            {subs.sort((a, b) => yearlyCost(b) - yearlyCost(a)).map((r) => (
              <Row key={r.id} onClick={() => setEdit(r)} left="📺" title={<>{r.name} {!r.active && <Badge>cancelled</Badge>}</>} sub={r.last_used_note ? `Last used: ${r.last_used_note}` : "Tap to add a last-used note"} right={<div><Amount value={yearlyCost(r)} className="font-medium" /><p className="text-[11px] text-muted">/year</p></div>} />
            ))}
          </Card>
        </div>
      )}

      {tab === "rent" && (
        <div className="mt-4 space-y-3">
          {rents.length === 0 && <Empty icon="🏠" title="No rent set up" action={<Button onClick={() => setEdit("new")}>Add rent</Button>} />}
          {rents.map((r) => {
            const hist = postedFor(r, d.transactions).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
            const fy = fyRange(today);
            return (
              <Card key={r.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">🏠 {r.landlord ?? r.name}</p>
                    <p className="text-xs text-muted">{formatINR(expectedAmount(r, today, d.transactions))} on the {ordinal(r.due_day)}{r.escalation_pct ? ` · +${r.escalation_pct}%/yr` : ""}</p>
                    {r.deposit > 0 && <p className="text-xs text-muted">Deposit held by landlord: {formatINR(r.deposit)} (receivable)</p>}
                  </div>
                  <Button size="sm" onClick={() => setEdit(r)}>Edit</Button>
                </div>
                <Link href={`/rent-receipt?rule=${r.id}&from=${fy.from}&to=${fy.to}`} className="mt-3 flex h-10 items-center justify-center rounded-xl border border-line bg-surface-2 text-sm">
                  🧾 Rent receipts for HRA (FY {fy.label})
                </Link>
                <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-muted">Payment history</p>
                {hist.slice(0, 12).map((t) => (
                  <div key={t.id} className="flex justify-between py-1 text-sm">
                    <span>{fmtDate(istDate(t.occurred_at), true)}</span>
                    <Amount value={t.amount} />
                  </div>
                ))}
                {hist.length === 0 && <p className="text-sm text-muted">No payments recorded yet.</p>}
              </Card>
            );
          })}
        </div>
      )}

      <RuleSheet rule={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function groupByDate<T extends { date: string }>(list: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of list) m.set(x.date, [...(m.get(x.date) ?? []), x]);
  return [...m];
}

function RuleSheet({ rule, onClose }: { rule: RecurringRule | "new" | null; onClose: () => void }) {
  const d = useData();
  const existing = rule && rule !== "new" ? rule : null;
  const key = existing?.id ?? (rule ? "new" : "none");
  const [r, setR] = useState<RecurringRule>(() => existing ?? newRule({ name: "", amount: 0 }));
  const [lastKey, setLastKey] = useState(key);
  const [amt, setAmt] = useState(existing ? String(existing.amount) : "");
  const [variable, setVariable] = useState(existing ? isVariable(existing) : false);
  if (key !== lastKey) {
    setLastKey(key);
    const next = existing ?? newRule({ name: "", amount: 0 });
    setR(next);
    setAmt(existing ? String(existing.amount) : "");
    setVariable(existing ? isVariable(existing) : false);
  }
  const set = (p: Partial<RecurringRule>) => setR({ ...r, ...p });
  const accounts = d.accounts.filter((a) => !a.archived);
  const a = parseAmount(amt) ?? 0;
  const valid = r.name.trim() && a > 0 && (r.txn_type !== "transfer" || r.to_account_id);

  function save() {
    saveRule({
      ...r,
      amount: a,
      amount_min: variable ? r.amount_min ?? Math.round(a * 0.7) : null,
      amount_max: variable ? r.amount_max ?? Math.round(a * 1.3) : null,
      kind: r.txn_type === "income" && r.kind !== "salary" ? "income" : r.kind,
    });
    onClose();
  }

  return (
    <Sheet open={!!rule} onClose={onClose} title={existing ? "Edit recurring" : "New recurring payment"}>
      <div className="grid grid-cols-2 gap-x-3">
        <div className="col-span-2"><Field label="Name"><Input value={r.name} onChange={(e) => set({ name: e.target.value })} placeholder="Rent, Electricity, Netflix…" /></Field></div>
        <Field label="Kind">
          <Select value={r.kind} onChange={(e) => {
            const kind = e.target.value as RecurringRule["kind"];
            set({ kind, txn_type: kind === "salary" || kind === "income" ? "income" : kind === "sip" || kind === "emi" ? "transfer" : "expense" });
          }}>
            {Object.keys(KIND_ICON).map((k) => <option key={k} value={k}>{KIND_ICON[k]} {k}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={r.txn_type} onChange={(e) => set({ txn_type: e.target.value as RecurringRule["txn_type"] })}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer (SIP / loan)</option>
          </Select>
        </Field>
        <Field label={variable ? "Typical amount (₹)" : "Amount (₹)"}><Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field label="Frequency">
          <Select value={r.frequency} onChange={(e) => set({ frequency: e.target.value as RecurringRule["frequency"] })}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
            <option value="weekly">Weekly</option>
            <option value="custom">Every N days</option>
          </Select>
        </Field>
        {r.frequency === "custom" ? (
          <Field label="Every N days"><Input inputMode="numeric" value={String(r.interval_days ?? 30)} onChange={(e) => set({ interval_days: parseInt(e.target.value) || 30 })} /></Field>
        ) : (
          <Field label="Due day">
            <Select value={r.due_day} onChange={(e) => set({ due_day: +e.target.value })}>{Array.from({ length: 31 }, (_, i) => i + 1).map((x) => <option key={x} value={x}>{ordinal(x)}</option>)}</Select>
          </Field>
        )}
        <Field label="Starts"><Input type="date" value={r.start_date} onChange={(e) => set({ start_date: e.target.value })} /></Field>
        <Field label={r.txn_type === "income" ? "Into account" : "From account"}>
          <Select value={r.account_id ?? ""} onChange={(e) => set({ account_id: e.target.value || null })}>
            <option value="">Default</option>
            {accounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        {r.txn_type === "transfer" ? (
          <Field label="To account">
            <Select value={r.to_account_id ?? ""} onChange={(e) => set({ to_account_id: e.target.value || null })}>
              <option value="">Choose…</option>
              {accounts.filter((x) => x.id !== r.account_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Method">
            <Select value={r.method} onChange={(e) => set({ method: e.target.value as PayMethod })}>
              {["upi", "card", "cash", "netbanking", "auto_debit", "other"].map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
        )}
        <div className="col-span-2">
          <Field label="Category">
            <Select value={r.category_id ?? ""} onChange={(e) => set({ category_id: e.target.value || null })}>
              <option value="">Uncategorised</option>
              {d.categories.map((c) => <option key={c.id} value={c.id}>{categoryPath(c.id, d.categories)}</option>)}
            </Select>
          </Field>
        </div>
        <div className="col-span-2">
          <Toggle checked={variable} onChange={setVariable} label="Amount varies (uses 3-month average)" />
          {variable && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min (₹)"><Input inputMode="decimal" value={String(r.amount_min ?? "")} onChange={(e) => set({ amount_min: parseAmount(e.target.value) })} /></Field>
              <Field label="Max (₹)"><Input inputMode="decimal" value={String(r.amount_max ?? "")} onChange={(e) => set({ amount_max: parseAmount(e.target.value) })} /></Field>
            </div>
          )}
          <Toggle checked={r.auto_post} onChange={(v) => set({ auto_post: v })} label="Auto-post (otherwise remind me to confirm)" />
          <Toggle checked={r.active} onChange={(v) => set({ active: v })} label="Active" />
        </div>
        {r.kind === "rent" && (
          <>
            <Field label="Landlord name"><Input value={r.landlord ?? ""} onChange={(e) => set({ landlord: e.target.value || null })} /></Field>
            <Field label="Landlord PAN" hint="Needed for HRA if rent > ₹1L/yr"><Input value={r.landlord_pan ?? ""} onChange={(e) => set({ landlord_pan: e.target.value.toUpperCase() || null })} /></Field>
            <Field label="Annual escalation %"><Input inputMode="decimal" value={String(r.escalation_pct)} onChange={(e) => set({ escalation_pct: parseFloat(e.target.value) || 0 })} /></Field>
            <Field label="Deposit held (₹)"><Input inputMode="decimal" value={String(r.deposit)} onChange={(e) => set({ deposit: parseAmount(e.target.value) ?? 0 })} /></Field>
            <div className="col-span-2"><Field label="Property address"><Input value={r.property_address ?? ""} onChange={(e) => set({ property_address: e.target.value || null })} /></Field></div>
          </>
        )}
        {r.kind === "subscription" && (
          <div className="col-span-2"><Field label="Last used"><Input value={r.last_used_note ?? ""} onChange={(e) => set({ last_used_note: e.target.value || null })} placeholder="Watched 2 weeks ago" /></Field></div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        {existing && <Button variant="danger" onClick={() => { deleteRule(existing.id); onClose(); }}>Delete</Button>}
        <Button variant="primary" className="flex-1" disabled={!valid} onClick={save}>Save</Button>
      </div>
    </Sheet>
  );
}
