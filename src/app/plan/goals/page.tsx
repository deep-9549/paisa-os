"use client";

import { useMemo, useState } from "react";
import { PLAN_TABS, SubTabs } from "@/components/PlanTabs";
import { Amount, Badge, Button, Card, Empty, Field, Input, PageHeader, Progress, Segmented, Select, Sheet } from "@/components/ui";
import { recentCycles } from "@/lib/domain/cycle";
import { fmtDate, istDate, monthsBetween } from "@/lib/domain/dates";
import { contributedIn, emergencyTarget, plannedMonthly, savedAmount } from "@/lib/domain/goals";
import { spendInRange } from "@/lib/domain/ledger";
import { formatINR, parseAmount } from "@/lib/domain/money";
import { contribute, deleteGoal, getProfile, newGoal, saveGoal } from "@/lib/store/actions";
import { useCycle, useData, useSafeToSpend, useToday } from "@/lib/store/selectors";
import type { Goal } from "@/lib/types";

export default function GoalsPage() {
  const d = useData();
  const today = useToday();
  const cycle = useCycle();
  const sts = useSafeToSpend();
  const [edit, setEdit] = useState<Goal | "new" | "sinking" | null>(null);
  const [add, setAdd] = useState<Goal | null>(null);
  const goals = d.goals.filter((g) => !g.archived);
  const avgExpense = useMemo(() => {
    const cs = recentCycles(today, 4, getProfile(d).cycle_history).slice(0, 3);
    return cs.reduce((a, c) => a + spendInRange(d.transactions, c.start, c.end), 0) / Math.max(cs.length, 1);
  }, [d, today]);

  return (
    <div>
      <PageHeader title="Plan" subtitle={<>Goal reserve this month <Amount value={sts.goalReserve} /></>} action={<Button size="sm" onClick={() => setEdit("new")}>+ Goal</Button>} />
      <SubTabs tabs={PLAN_TABS} />
      {goals.length === 0 && <Empty icon="🎯" title="No goals yet" body="Plan a trip or a gadget — the monthly contribution is reserved from Safe-to-Spend." action={<Button variant="primary" onClick={() => setEdit("new")}>Create goal</Button>} />}
      <div className="space-y-3">
        {goals.map((g) => {
          const saved = savedAmount(g, d.goal_contributions);
          const plan = plannedMonthly(g, d.goal_contributions, cycle);
          const thisCycle = contributedIn(g, d.goal_contributions, cycle);
          const roundups = d.goal_contributions.filter((c) => c.goal_id === g.id && c.source === "roundup").reduce((a, c) => a + c.amount, 0);
          const target = g.kind === "emergency" && avgExpense > 0 ? Math.max(g.target, emergencyTarget(avgExpense)) : g.target;
          return (
            <Card key={g.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{g.emoji} {g.name} {g.kind !== "goal" && <Badge>{g.kind === "emergency" ? "emergency" : "sinking fund"}</Badge>}</p>
                  <p className="text-xs text-muted">
                    {g.target_date ? `by ${fmtDate(g.target_date, true)} · ${Math.max(monthsBetween(today, g.target_date), 0)} months left` : "no deadline"}
                    {g.roundup_to > 0 && ` · round-ups to ₹${g.roundup_to}`}
                  </p>
                </div>
                <button className="min-h-11 px-2 text-sm text-muted" onClick={() => setEdit(g)} aria-label={`Edit ${g.name}`}>Edit</button>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-xl font-bold"><Amount value={saved} /></span>
                <span className="text-sm text-muted">of <Amount value={target} /></span>
              </div>
              <div className="mt-1"><Progress value={saved / Math.max(target, 1)} label={`${g.name} progress`} /></div>
              <div className="mt-2 flex flex-wrap justify-between gap-1 text-xs text-muted">
                {plan > 0 ? <span>Needs {formatINR(plan)}/month · {formatINR(thisCycle)} this month</span> : <span>{formatINR(thisCycle)} added this month</span>}
                {roundups > 0 && <span>{formatINR(roundups)} from round-ups</span>}
              </div>
              {g.kind === "emergency" && avgExpense > 0 && <p className="mt-1 text-[11px] text-muted">Target = 6 × average monthly expenses ({formatINR(avgExpense)})</p>}
              <Button size="sm" className="mt-3 w-full" onClick={() => setAdd(g)}>+ Add money</Button>
            </Card>
          );
        })}
      </div>
      <button className="mt-4 min-h-11 w-full text-sm text-accent" onClick={() => setEdit("sinking")}>+ Sinking fund for an annual cost (insurance, card fee, Diwali)</button>
      <GoalSheet goal={edit} onClose={() => setEdit(null)} />
      <AddMoney goal={add} onClose={() => setAdd(null)} left={sts.month} />
    </div>
  );
}

function AddMoney({ goal, onClose, left }: { goal: Goal | null; onClose: () => void; left: number }) {
  const [v, setV] = useState("");
  if (!goal) return null;
  return (
    <Sheet open onClose={onClose} title={`Add to ${goal.name}`}>
      <Field label="Amount (₹)" hint={`Left this month: ${formatINR(left)}`}><Input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus /></Field>
      <Button variant="primary" className="w-full" disabled={!parseAmount(v)} onClick={() => { contribute(goal.id, parseAmount(v)!); onClose(); setV(""); }}>Add</Button>
    </Sheet>
  );
}

function GoalSheet({ goal, onClose }: { goal: Goal | "new" | "sinking" | null; onClose: () => void }) {
  const d = useData();
  const existing = goal && typeof goal === "object" ? goal : null;
  const key = existing?.id ?? String(goal);
  const init = () => existing ?? newGoal({ name: "", target: 0, kind: goal === "sinking" ? "sinking" : "goal", emoji: goal === "sinking" ? "🗓️" : "🎯" });
  const [g, setG] = useState<Goal>(init);
  const [target, setTarget] = useState(existing ? String(existing.target) : "");
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setG(init());
    setTarget(existing ? String(existing.target) : "");
  }
  const set = (p: Partial<Goal>) => setG({ ...g, ...p });
  return (
    <Sheet open={!!goal} onClose={onClose} title={existing ? "Edit goal" : g.kind === "sinking" ? "New sinking fund" : "New goal"}>
      <div className="grid grid-cols-[72px_1fr] gap-x-3">
        <Field label="Emoji"><Input value={g.emoji} onChange={(e) => set({ emoji: e.target.value })} className="text-center" /></Field>
        <Field label="Name"><Input value={g.name} onChange={(e) => set({ name: e.target.value })} placeholder={g.kind === "sinking" ? "Health insurance" : "Goa trip"} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Target (₹)"><Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        <Field label="Target date"><Input type="date" value={g.target_date ?? ""} min={istDate()} onChange={(e) => set({ target_date: e.target.value || null })} /></Field>
        <Field label="Type">
          <Select value={g.kind} onChange={(e) => set({ kind: e.target.value as Goal["kind"] })}>
            <option value="goal">Goal</option>
            <option value="sinking">Sinking fund</option>
            <option value="emergency">Emergency fund</option>
          </Select>
        </Field>
        <Field label="Kept in account">
          <Select value={g.account_id ?? ""} onChange={(e) => set({ account_id: e.target.value || null })}>
            <option value="">—</option>
            {d.accounts.filter((a) => !a.archived && a.type !== "credit_card").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Round-up savings" hint="Each spend is virtually rounded up and the difference goes to this goal.">
        <Segmented value={String(g.roundup_to)} onChange={(v) => set({ roundup_to: parseInt(v) })} options={[{ value: "0", label: "Off" }, { value: "10", label: "₹10" }, { value: "50", label: "₹50" }, { value: "100", label: "₹100" }]} />
      </Field>
      <div className="mt-2 flex gap-2">
        {existing && <Button variant="danger" onClick={() => { deleteGoal(existing.id); onClose(); }}>Delete</Button>}
        {existing && <Button onClick={() => { saveGoal({ ...g, archived: true }); onClose(); }}>Archive</Button>}
        <Button variant="primary" className="flex-1" disabled={!g.name || !parseAmount(target)} onClick={() => { saveGoal({ ...g, target: parseAmount(target)! }); onClose(); }}>Save</Button>
      </div>
    </Sheet>
  );
}
