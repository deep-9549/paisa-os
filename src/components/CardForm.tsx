"use client";

import { useState } from "react";
import { ordinal } from "@/lib/domain/cycle";
import { istDate } from "@/lib/domain/dates";
import { parseAmount } from "@/lib/domain/money";
import { newAccount, saveAccount } from "@/lib/store/actions";
import { useData } from "@/lib/store/selectors";
import type { CreditCard, RewardRule } from "@/lib/types";
import { Button, Field, Input, Select, Toggle } from "./ui";

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function CardForm({ cardId, onDone }: { cardId?: string; onDone: () => void }) {
  const d = useData();
  const acc = cardId ? d.accounts.find((a) => a.id === cardId) : undefined;
  const c = cardId ? d.credit_cards.find((x) => x.account_id === cardId) : undefined;
  const [name, setName] = useState(acc?.name ?? "");
  const [bank, setBank] = useState(c?.bank ?? "Bank of India");
  const [last4, setLast4] = useState(c?.last4 ?? "");
  const [limit, setLimit] = useState(c ? String(c.credit_limit) : "");
  const [statementDay, setStatementDay] = useState(c?.statement_day ?? 15);
  const [dueMode, setDueMode] = useState<CreditCard["due_mode"]>(c?.due_mode ?? "after_statement");
  const [dueDay, setDueDay] = useState(c?.due_day ?? 5);
  const [grace, setGrace] = useState(String(c?.grace_days ?? 20));
  const [minPct, setMinPct] = useState(String(c?.min_due_pct ?? 5));
  const [fee, setFee] = useState(String(c?.annual_fee ?? 0));
  const [waiver, setWaiver] = useState(c?.fee_waiver_spend ? String(c.fee_waiver_spend) : "");
  const [anniv, setAnniv] = useState(c?.fee_anniversary ?? istDate());
  const [rules, setRules] = useState<RewardRule[]>(c?.reward_rules ?? [{ match: "*", rate: 1 }]);
  const [expiry, setExpiry] = useState(String(c?.points_expiry_months ?? 24));
  const [rupay, setRupay] = useState(c?.is_rupay_upi ?? false);
  const [color, setColor] = useState(acc?.color ?? "#ea580c");
  const valid = name && last4.length === 4 && (parseAmount(limit) ?? 0) > 0;

  function save() {
    const a = acc ? { ...acc, name, color } : newAccount({ name, type: "credit_card", color });
    saveAccount(a, {
      account_id: a.id, bank, last4, credit_limit: parseAmount(limit) ?? 0, statement_day: statementDay, due_mode: dueMode, due_day: dueDay,
      grace_days: parseInt(grace) || 20, min_due_pct: parseFloat(minPct) || 5, annual_fee: parseAmount(fee) ?? 0,
      fee_waiver_spend: parseAmount(waiver), fee_anniversary: anniv, reward_rules: rules.filter((r) => r.match), points_redeemed: c?.points_redeemed ?? 0,
      points_expiry_months: parseInt(expiry) || 0, is_rupay_upi: rupay,
    });
    onDone();
  }

  return (
    <div className="grid grid-cols-2 gap-x-3">
      <div className="col-span-2"><Field label="Card name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="BOI RuPay Credit Card" /></Field></div>
      <Field label="Bank"><Input value={bank} onChange={(e) => setBank(e.target.value)} /></Field>
      <Field label="Last 4 digits"><Input inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} /></Field>
      <Field label="Credit limit (₹)"><Input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
      <Field label="Statement day"><Select value={statementDay} onChange={(e) => setStatementDay(+e.target.value)}>{DAYS.map((x) => <option key={x} value={x}>{ordinal(x)}</option>)}</Select></Field>
      <Field label="Due date rule">
        <Select value={dueMode} onChange={(e) => setDueMode(e.target.value as CreditCard["due_mode"])}>
          <option value="after_statement">Days after statement</option>
          <option value="fixed">Fixed day</option>
        </Select>
      </Field>
      {dueMode === "fixed" ? (
        <Field label="Due day"><Select value={dueDay} onChange={(e) => setDueDay(+e.target.value)}>{DAYS.map((x) => <option key={x} value={x}>{ordinal(x)}</option>)}</Select></Field>
      ) : (
        <Field label="Grace days"><Input inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value)} /></Field>
      )}
      <Field label="Minimum due %"><Input inputMode="decimal" value={minPct} onChange={(e) => setMinPct(e.target.value)} /></Field>
      <Field label="Annual fee (₹)"><Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
      <Field label="Waived above spend (₹)"><Input inputMode="decimal" value={waiver} onChange={(e) => setWaiver(e.target.value)} /></Field>
      <Field label="Card anniversary"><Input type="date" value={anniv} onChange={(e) => setAnniv(e.target.value)} /></Field>
      <Field label="Points expire after (months)"><Input inputMode="numeric" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
      <Field label="Colour"><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="p-1" /></Field>
      <div className="col-span-2">
        <p className="mb-1 text-xs font-medium text-muted">Reward rules (merchant contains → %; * = everything else)</p>
        {rules.map((r, i) => (
          <div key={i} className="mb-1 flex gap-2">
            <Input className="h-9" value={r.match} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, match: e.target.value } : x)))} placeholder="swiggy" aria-label="Merchant match" />
            <Input className="h-9 w-24" inputMode="decimal" value={String(r.rate)} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, rate: parseFloat(e.target.value) || 0 } : x)))} aria-label="Reward percent" />
            <Button size="sm" variant="ghost" onClick={() => setRules(rules.filter((_, j) => j !== i))} aria-label="Remove rule">✕</Button>
          </div>
        ))}
        <Button size="sm" onClick={() => setRules([...rules, { match: "", rate: 1 }])}>+ Rule</Button>
      </div>
      <div className="col-span-2 mt-2"><Toggle checked={rupay} onChange={setRupay} label="RuPay card linked to UPI" /></div>
      <Button variant="primary" className="col-span-2 mt-3" disabled={!valid} onClick={save}>Save card</Button>
    </div>
  );
}
