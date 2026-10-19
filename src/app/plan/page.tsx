"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PLAN_TABS, SubTabs } from "@/components/PlanTabs";
import { Amount, Badge, Button, Card, Empty, Field, Input, PageHeader, Progress, SectionTitle, Segmented, Select, Sheet, Toggle } from "@/components/ui";
import { cardSpend, envelopes, methodSplit, paceStatus } from "@/lib/domain/budgets";
import { elapsedFraction } from "@/lib/domain/cycle";
import { fmtDate } from "@/lib/domain/dates";
import { formatINR, parseAmount } from "@/lib/domain/money";
import { deleteBudgetLine, getProfile, saveBudgetLine, updateProfile } from "@/lib/store/actions";
import { useCycle, useData, usePrevCycle, useSafeToSpend, useToday } from "@/lib/store/selectors";
import type { BudgetLine } from "@/lib/types";

const METHOD_COLORS: Record<string, string> = { upi: "#7c8cff", card: "#f97316", cash: "#34d399", netbanking: "#60a5fa", auto_debit: "#a855f7", other: "#94a3b8", friend: "#ec4899" };

export default function BudgetsPage() {
  const d = useData();
  const p = getProfile(d);
  const today = useToday();
  const cycle = useCycle();
  const prev = usePrevCycle(cycle);
  const sts = useSafeToSpend();
  const [edit, setEdit] = useState<BudgetLine | "new" | null>(null);
  const [view, setView] = useState<"envelopes" | "zero">("envelopes");
  const [capOpen, setCapOpen] = useState(false);
  const env = useMemo(() => envelopes(d.budget_lines, d.categories, d.transactions, cycle, prev, today), [d, cycle, prev, today]);
  const totalBudget = env.reduce((a, e) => a + e.budget, 0);
  const totalSpent = env.reduce((a, e) => a + e.spent, 0);
  const elapsed = elapsedFraction(cycle, today);
  const cardIds = new Set(d.credit_cards.map((c) => c.account_id));
  const cardSpent = cardSpend(d.transactions, cardIds, cycle);
  const unassigned = sts.income - sts.fixedCommitments - sts.investments - sts.goalReserve - sts.buffer - totalBudget - sts.variableUpcoming;

  return (
    <div>
      <PageHeader title="Plan" subtitle={`${fmtDate(cycle.start)} – ${fmtDate(cycle.end)} · ${Math.round(elapsed * 100)}% of the month gone`} action={<Button size="sm" onClick={() => setEdit("new")}>+ Budget</Button>} />
      <SubTabs tabs={PLAN_TABS} />
      <Segmented value={view} onChange={setView} options={[{ value: "envelopes", label: "Envelopes" }, { value: "zero", label: "Zero-based" }]} />

      {view === "envelopes" ? (
        <>
          <Card className="mt-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted">Budgeted spend</p>
                <p className="text-2xl font-bold"><Amount value={totalSpent} /> <span className="text-sm font-normal text-muted">/ <Amount value={totalBudget} /></span></p>
              </div>
              <Badge tone={paceStatus(totalSpent, totalBudget, elapsed).status === "ok" ? "good" : paceStatus(totalSpent, totalBudget, elapsed).status === "warn" ? "warn" : "bad"}>
                {totalBudget ? `${Math.round((totalSpent / totalBudget) * 100)}%` : "—"}
              </Badge>
            </div>
            <div className="mt-2"><Progress value={totalBudget ? totalSpent / totalBudget : 0} tone={paceStatus(totalSpent, totalBudget, elapsed).status} marker={elapsed} label="Total budget" /></div>
          </Card>

          {cardIds.size > 0 && (
            <Card className="mt-2" onClick={() => setCapOpen(true)}>
              <div className="flex justify-between text-sm">
                <span>💳 Card spend this cycle</span>
                <span><Amount value={cardSpent} />{p.card_cap ? <> / <Amount value={p.card_cap} /></> : <span className="text-muted"> · set a cap</span>}</span>
              </div>
              {p.card_cap ? <div className="mt-2"><Progress value={cardSpent / p.card_cap} tone={paceStatus(cardSpent, p.card_cap, elapsed).status} marker={elapsed} label="Card cap" /></div> : null}
              <p className="mt-1 text-[11px] text-muted">A card cap keeps next month&apos;s bill predictable.</p>
            </Card>
          )}

          <SectionTitle>Envelopes</SectionTitle>
          {env.length === 0 && <Empty icon="📊" title="No budgets yet" body="Budgets work across UPI, card and cash alike." action={<Button variant="primary" onClick={() => setEdit("new")}>Add budget</Button>} />}
          <div className="space-y-2">
            {env.map((e) => {
              const fam = new Set([e.line.category_id, ...d.categories.filter((c) => c.parent_id === e.line.category_id).map((c) => c.id)]);
              const split = methodSplit(d.transactions, cycle, fam);
              const splitTotal = Object.values(split).reduce((a, b) => a + b, 0);
              return (
                <Card key={e.line.id} onClick={() => setEdit(e.line)}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{e.category?.icon} {e.category?.name}</span>
                    <span className="text-sm"><Amount value={e.spent} /> <span className="text-muted">/ <Amount value={e.budget} /></span></span>
                  </div>
                  <div className="mt-2"><Progress value={e.pct} tone={e.status} marker={e.elapsed} label={e.label} /></div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                    <span className={e.status === "over" ? "text-bad" : e.overPace ? "text-warn" : ""}>{e.label}</span>
                    <span>{e.budget - e.spent >= 0 ? `${formatINR(e.budget - e.spent)} left` : `${formatINR(e.spent - e.budget)} over`}</span>
                  </div>
                  {e.rolledOver > 0 && <p className="text-[11px] text-good">+{formatINR(e.rolledOver)} rolled over</p>}
                  {splitTotal > 0 && (
                    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full" aria-label="Paid by method">
                      {Object.entries(split).map(([m, v]) => (
                        <div key={m} style={{ width: `${(v / splitTotal) * 100}%`, background: METHOD_COLORS[m] }} title={`${m} ${formatINR(v)}`} />
                      ))}
                    </div>
                  )}
                  {splitTotal > 0 && (
                    <p className="mt-1 text-[10px] text-muted">{Object.entries(split).map(([m, v]) => `${m.toUpperCase()} ${formatINR(v, { compact: true })}`).join(" · ")}</p>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <ZeroBased unassigned={unassigned} totalBudget={totalBudget} />
      )}

      <BudgetSheet line={edit} onClose={() => setEdit(null)} />
      <Sheet open={capOpen} onClose={() => setCapOpen(false)} title="Card cap">
        <CapForm current={p.card_cap} onSave={(v) => { updateProfile({ card_cap: v }); setCapOpen(false); }} />
      </Sheet>
    </div>
  );
}

function ZeroBased({ unassigned, totalBudget }: { unassigned: number; totalBudget: number }) {
  const sts = useSafeToSpend();
  const rows: [string, number, string][] = [
    ["Income", sts.income, "/activity?type=income"],
    ["Fixed commitments", -sts.fixedCommitments, "/plan/recurring"],
    ["Variable bills (avg)", -sts.variableUpcoming, "/plan/recurring"],
    ["Investments", -sts.investments, "/invest/portfolio"],
    ["Goals", -sts.goalReserve, "/plan/goals"],
    ["Buffer", -sts.buffer, "/settings"],
    ["Category budgets", -totalBudget, "/plan"],
  ];
  return (
    <Card className="mt-4">
      <p className="mb-2 text-sm text-muted">Give every rupee of salary a job: a category, a goal or a commitment.</p>
      {rows.map(([k, v, href]) => (
        <Link key={k} href={href} className="flex min-h-10 items-center justify-between text-sm">
          <span>{k}</span>
          <Amount value={v} sign />
        </Link>
      ))}
      <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
        <span className="font-semibold">Unassigned</span>
        <Amount value={unassigned} className={`text-lg font-bold ${Math.abs(unassigned) < 1 ? "text-good" : unassigned < 0 ? "text-bad" : "text-warn"}`} />
      </div>
      <p className="mt-1 text-xs text-muted">{Math.abs(unassigned) < 1 ? "Every rupee is assigned. 🎯" : unassigned > 0 ? "Assign the rest to a budget or a goal." : "You've assigned more than you earn — trim a budget."}</p>
    </Card>
  );
}

function CapForm({ current, onSave }: { current: number | null; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(current ? String(current) : "");
  return (
    <div>
      <Field label="Max total card spend per cycle (₹)"><Input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus /></Field>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => onSave(null)}>Remove cap</Button>
        <Button variant="primary" className="flex-1" onClick={() => onSave(parseAmount(v))}>Save</Button>
      </div>
    </div>
  );
}

function BudgetSheet({ line, onClose }: { line: BudgetLine | "new" | null; onClose: () => void }) {
  const d = useData();
  const existing = line && line !== "new" ? line : null;
  const [cat, setCat] = useState(existing?.category_id ?? "");
  const [amt, setAmt] = useState(existing ? String(existing.amount) : "");
  const [roll, setRoll] = useState(existing?.rollover ?? false);
  const key = existing?.id ?? "new";
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setCat(existing?.category_id ?? "");
    setAmt(existing ? String(existing.amount) : "");
    setRoll(existing?.rollover ?? false);
  }
  const used = new Set(d.budget_lines.map((b) => b.category_id));
  const options = d.categories.filter((c) => c.kind === "expense" && (!used.has(c.id) || c.id === existing?.category_id));
  return (
    <Sheet open={!!line} onClose={onClose} title={existing ? "Edit budget" : "New budget"}>
      <Field label="Category" hint="A parent category includes all its sub-categories.">
        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Choose…</option>
          {options.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? `  ${d.categories.find((x) => x.id === c.parent_id)?.name} › ${c.name}` : `${c.icon} ${c.name}`}</option>)}
        </Select>
      </Field>
      <Field label="Monthly amount (₹)"><Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
      <Toggle checked={roll} onChange={setRoll} label="Roll over unspent amount to next month" />
      <div className="mt-4 flex gap-2">
        {existing && <Button variant="danger" onClick={() => { deleteBudgetLine(existing.id); onClose(); }}>Delete</Button>}
        <Button variant="primary" className="flex-1" disabled={!cat || !parseAmount(amt)} onClick={() => { saveBudgetLine(cat, parseAmount(amt)!, roll, existing?.id); onClose(); }}>Save</Button>
      </div>
    </Sheet>
  );
}
