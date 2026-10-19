"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CardForm } from "@/components/CardForm";
import { TxnDetailSheet } from "@/components/TxnDetail";
import { TxnRow } from "@/components/TxnRow";
import { Amount, Badge, Button, Card, Empty, Field, Input, PageHeader, Progress, SectionTitle, Segmented, Select, Sheet, Textarea } from "@/components/ui";
import { emiSchedule, feeWaiverProgress, rewardsSummary, type Statement } from "@/lib/domain/cards";
import { ordinal } from "@/lib/domain/cycle";
import { diffDays, fmtDate, istDate, relativeDay } from "@/lib/domain/dates";
import { isLive, txnDate } from "@/lib/domain/ledger";
import { formatINR, parseAmount } from "@/lib/domain/money";
import { addTransaction, payCardBill, saveAccount, setMinDueOverride } from "@/lib/store/actions";
import { useBalances, useCardSummaries, useData, useToday } from "@/lib/store/selectors";
import type { Transaction } from "@/lib/types";

const STATUS: Record<string, { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  paid: { label: "Paid", tone: "good" },
  partly_paid: { label: "Partly paid", tone: "warn" },
  unpaid: { label: "Unpaid", tone: "neutral" },
  overdue: { label: "Overdue", tone: "bad" },
};

export default function CardDetail() {
  const { id } = useParams<{ id: string }>();
  const d = useData();
  const today = useToday();
  const s = useCardSummaries().find((c) => c.card.account_id === id);
  const [pay, setPay] = useState(false);
  const [edit, setEdit] = useState(false);
  const [recon, setRecon] = useState<Statement | null>(null);
  const [redeem, setRedeem] = useState(false);
  const [open, setOpen] = useState<Transaction | null>(null);
  const [minEdit, setMinEdit] = useState<Statement | null>(null);

  const cycleTxns = useMemo(
    () => (s ? d.transactions.filter((t) => isLive(t) && (t.account_id === id || t.to_account_id === id) && txnDate(t) >= s.open.start && txnDate(t) <= s.open.end).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)) : []),
    [d, s, id],
  );
  if (!s) return <Empty icon="💳" title="Card not found" />;
  const rewards = rewardsSummary(s.card, d.transactions, today);
  const waiver = feeWaiverProgress(s.card, d.transactions, today);
  const emis = d.card_emis.filter((e) => e.card_id === id && e.active);

  return (
    <div>
      <PageHeader back="/cards" title={s.account.name} subtitle={`•••• ${s.card.last4} · statement on the ${ordinal(s.card.statement_day)}`} action={<Button size="sm" onClick={() => setEdit(true)}>Edit</Button>} />

      <div className="grid grid-cols-2 gap-2">
        <Card>
          <p className="text-xs text-muted">Unbilled (this cycle)</p>
          <p className="text-xl font-bold"><Amount value={s.unbilled} /></p>
          <p className="text-[11px] text-muted">{fmtDate(s.open.start)} – {fmtDate(s.open.end)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Statement due</p>
          <p className="text-xl font-bold"><Amount value={s.billedDue} /></p>
          {s.nextDue ? (
            <p className={`text-[11px] ${diffDays(s.nextDue.date, today) < 0 ? "text-bad" : "text-muted"}`}>
              {relativeDay(s.nextDue.date, today)} · min {formatINR(s.nextDue.min)}
            </p>
          ) : (
            <p className="text-[11px] text-good">Nothing due</p>
          )}
        </Card>
      </div>
      <Card className="mt-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted">Total outstanding</span>
          <Amount value={s.outstanding} className="font-semibold" />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Available limit</span>
          <Amount value={s.available} className={s.available < 0 ? "font-semibold text-bad" : "font-semibold"} />
        </div>
        <div className="mt-2"><Progress value={s.utilisation} tone={s.utilisation > 0.3 ? "warn" : "ok"} label="Utilisation" /></div>
        <p className="mt-1 text-xs text-muted">{Math.round(s.utilisation * 100)}% utilisation{s.utilisation > 0.3 && " — above 30% can hurt your credit score"}{s.available < 0 && " · limit exceeded"}</p>
        <Button variant="primary" className="mt-3 w-full" onClick={() => setPay(true)} disabled={s.outstanding <= 0}>Pay bill</Button>
      </Card>

      {waiver && (
        <Card className="mt-2">
          <p className="text-sm">
            {waiver.remaining > 0 ? (
              <>{formatINR(waiver.remaining)} more spend to waive the {formatINR(waiver.fee)} fee by {fmtDate(waiver.deadline)}</>
            ) : (
              <>🎉 Annual fee of {formatINR(waiver.fee)} waived this card year</>
            )}
          </p>
          <div className="mt-2"><Progress value={waiver.pct} label="Fee waiver progress" /></div>
          <p className="mt-1 text-[11px] text-muted">{formatINR(waiver.spent)} of {formatINR(waiver.target)} spent</p>
        </Card>
      )}

      <Card className="mt-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">Reward points</p>
            <p className="text-xl font-bold tabular">{Math.floor(rewards.balance).toLocaleString("en-IN")}</p>
            <p className="text-[11px] text-muted">
              {Math.floor(rewards.earned).toLocaleString("en-IN")} earned · {s.card.points_redeemed.toLocaleString("en-IN")} redeemed
              {rewards.expiringSoon > 0 && <span className="text-warn"> · {Math.floor(rewards.expiringSoon)} expiring in 30 days</span>}
            </p>
          </div>
          <Button size="sm" onClick={() => setRedeem(true)}>Redeem</Button>
        </div>
        <p className="mt-2 text-[11px] text-muted">{s.card.reward_rules.map((r) => `${r.match === "*" ? "Everything else" : r.match} ${r.rate}%`).join(" · ")}</p>
      </Card>

      {emis.length > 0 && (
        <>
          <SectionTitle>EMIs</SectionTitle>
          <Card className="space-y-3">
            {emis.map((e) => {
              const sched = emiSchedule(e);
              const paid = sched.filter((i) => i.date <= today).length;
              const t = d.transactions.find((x) => x.id === e.transaction_id);
              return (
                <div key={e.id}>
                  <div className="flex justify-between text-sm">
                    <span>{t?.merchant ?? "Purchase"} · {e.tenure_months} mo @ {e.annual_rate}%</span>
                    <span><Amount value={sched[0].total} decimals />/mo</span>
                  </div>
                  <Progress value={paid / e.tenure_months} label="EMI progress" />
                  <p className="mt-0.5 text-[11px] text-muted">{paid}/{e.tenure_months} paid · next {sched.find((i) => i.date > today) ? fmtDate(sched.find((i) => i.date > today)!.date) : "—"}</p>
                </div>
              );
            })}
          </Card>
        </>
      )}

      <SectionTitle>Statements</SectionTitle>
      <Card className="p-1">
        {[...s.statements].reverse().filter((x) => x.total !== 0 || x.paid !== 0).slice(0, 12).map((st) => (
          <div key={st.end} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {fmtDate(st.end, true)} {st.adjusted && <Badge tone="info">adjusted</Badge>}
              </p>
              <p className="text-xs text-muted">due {fmtDate(st.due_date)} · min {formatINR(st.min_due)}{st.emi_due > 0 && ` · incl. EMI ${formatINR(st.emi_due)}`}</p>
              <div className="mt-1 flex gap-2">
                <button className="text-xs text-accent" onClick={() => setRecon(st)}>Reconcile</button>
                <button className="text-xs text-accent" onClick={() => setMinEdit(st)}>Edit min due</button>
              </div>
            </div>
            <div className="text-right">
              <Amount value={st.total} className="text-sm font-semibold" />
              <div className="mt-0.5"><Badge tone={STATUS[st.status].tone}>{STATUS[st.status].label}</Badge></div>
              {st.paid > 0 && st.paid < st.total && <p className="text-[11px] text-muted">paid {formatINR(st.paid)}</p>}
            </div>
          </div>
        ))}
        {s.statements.every((x) => x.total === 0) && <p className="py-4 text-center text-sm text-muted">No statements yet. The first one closes on {fmtDate(s.open.end)}.</p>}
      </Card>

      <SectionTitle>This cycle</SectionTitle>
      <Card className="p-1">
        {cycleTxns.length ? cycleTxns.map((t) => <TxnRow key={t.id} t={t} onClick={() => setOpen(t)} />) : <p className="py-4 text-center text-sm text-muted">No swipes this cycle.</p>}
      </Card>

      <PaySheet open={pay} onClose={() => setPay(false)} cardId={id} billed={s.billedDue} min={s.nextDue?.min ?? 0} outstanding={s.outstanding} />
      <Sheet open={edit} onClose={() => setEdit(false)} title="Card settings"><CardForm cardId={id} onDone={() => setEdit(false)} /></Sheet>
      <ReconSheet st={recon} cardId={id} onClose={() => setRecon(null)} />
      <RedeemSheet open={redeem} onClose={() => setRedeem(false)} cardId={id} max={rewards.balance} />
      <MinDueSheet st={minEdit} cardId={id} onClose={() => setMinEdit(null)} />
      <TxnDetailSheet txn={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function PaySheet({ open, onClose, cardId, billed, min, outstanding }: { open: boolean; onClose: () => void; cardId: string; billed: number; min: number; outstanding: number }) {
  const d = useData();
  const balances = useBalances();
  const banks = d.accounts.filter((a) => !a.archived && (a.type === "savings" || a.type === "wallet"));
  const [kind, setKind] = useState<"full" | "min" | "all" | "custom">("full");
  const [custom, setCustom] = useState("");
  const [from, setFrom] = useState(banks[0]?.id ?? "");
  const [date, setDate] = useState(istDate());
  const amount = kind === "full" ? billed : kind === "min" ? min : kind === "all" ? outstanding : parseAmount(custom) ?? 0;
  return (
    <Sheet open={open} onClose={onClose} title="Pay card bill">
      <Segmented value={kind} onChange={setKind} options={[{ value: "full", label: "Statement" }, { value: "min", label: "Minimum" }, { value: "all", label: "All dues" }, { value: "custom", label: "Custom" }]} />
      <div className="my-4 text-center text-3xl font-bold"><Amount value={amount} /></div>
      {kind === "custom" && <Field label="Amount"><Input inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} autoFocus /></Field>}
      <Field label="Pay from">
        <Select value={from} onChange={(e) => setFrom(e.target.value)}>
          {banks.map((b) => <option key={b.id} value={b.id}>{b.name} · {formatINR(balances.get(b.id) ?? 0)}</option>)}
        </Select>
      </Field>
      <Field label="Paid on"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <p className="mb-3 text-xs text-muted">Recorded as a transfer bank → card. Your budget is not touched again — the swipes already counted on the day you spent.</p>
      <Button variant="primary" className="w-full" disabled={amount <= 0 || !from} onClick={() => { payCardBill(cardId, from, amount, date); onClose(); }}>
        Record payment
      </Button>
    </Sheet>
  );
}

/** Paste statement lines → match to logged swipes → highlight missing ones. */
function ReconSheet({ st, cardId, onClose }: { st: Statement | null; cardId: string; onClose: () => void }) {
  const d = useData();
  const [text, setText] = useState("");
  const lines = useMemo(() => parseStatementLines(text), [text]);
  if (!st) return null;
  const swipes = d.transactions.filter((t) => isLive(t) && t.account_id === cardId && t.type === "expense" && txnDate(t) >= st.start && txnDate(t) <= st.end);
  const used = new Set<string>();
  const matched = lines.map((l) => {
    const m = swipes.find((t) => !used.has(t.id) && Math.abs(t.amount - l.amount) <= 1 && (!l.date || Math.abs(diffDays(txnDate(t), l.date)) <= 3));
    if (m) used.add(m.id);
    return { ...l, match: m };
  });
  const extra = swipes.filter((t) => !used.has(t.id));
  return (
    <Sheet open onClose={onClose} title={`Reconcile ${fmtDate(st.end, true)} statement`} wide>
      <p className="mb-2 text-sm text-muted">Paste the transaction lines from your statement PDF or email (one per line, with date and amount).</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"12/10/2026 SWIGGY BANGALORE 420.00\n14/10/2026 AMAZON PAY 1,299.00"} rows={5} />
      {lines.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs text-muted">{matched.filter((m) => m.match).length} of {lines.length} matched · statement total {formatINR(lines.reduce((a, l) => a + l.amount, 0))} vs logged {formatINR(st.total)}</p>
          {matched.map((m, i) => (
            <div key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${m.match ? "bg-good/10" : "bg-bad/10"}`}>
              <span className="flex-1 truncate">{m.date ? fmtDate(m.date) : ""} {m.desc}</span>
              <Amount value={m.amount} decimals />
              {m.match ? (
                <Badge tone="good">✓</Badge>
              ) : (
                <Button size="sm" onClick={() => addTransaction({ amount: m.amount, account_id: cardId, method: "card", merchant: m.desc.slice(0, 40) || "Statement item", occurred_at: new Date(`${m.date ?? st.end}T12:00:00+05:30`).toISOString() })}>
                  Add
                </Button>
              )}
            </div>
          ))}
          {extra.length > 0 && <p className="pt-2 text-xs text-warn">{extra.length} logged swipe(s) not on the statement: {extra.map((t) => `${t.merchant} ${formatINR(t.amount)}`).join(", ")}</p>}
        </div>
      )}
    </Sheet>
  );
}

function parseStatementLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => {
      const amt = line.match(/([\d,]+\.\d{2})(?:\s*(?:dr|cr))?\s*$/i) ?? line.match(/([\d,]+(?:\.\d{1,2})?)\s*$/);
      if (!amt) return null;
      const amount = parseAmount(amt[1]);
      if (!amount) return null;
      const dm = line.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
      const date = dm ? `${dm[3].length === 2 ? `20${dm[3]}` : dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}` : null;
      const desc = line.replace(amt[0], "").replace(dm?.[0] ?? "", "").trim();
      if (/cr\s*$/i.test(amt[0])) return null; // credits/payments
      return { amount, date, desc };
    })
    .filter((x): x is { amount: number; date: string | null; desc: string } => !!x);
}

function RedeemSheet({ open, onClose, cardId, max }: { open: boolean; onClose: () => void; cardId: string; max: number }) {
  const d = useData();
  const [pts, setPts] = useState("");
  const card = d.credit_cards.find((c) => c.account_id === cardId)!;
  const acc = d.accounts.find((a) => a.id === cardId)!;
  const n = parseInt(pts) || 0;
  return (
    <Sheet open={open} onClose={onClose} title="Redeem points">
      <Field label={`Points to redeem (max ${Math.floor(max)})`}><Input inputMode="numeric" value={pts} onChange={(e) => setPts(e.target.value)} /></Field>
      <Button variant="primary" className="w-full" disabled={n <= 0 || n > max} onClick={() => { saveAccount(acc, { ...card, points_redeemed: card.points_redeemed + n }); onClose(); }}>Redeem</Button>
    </Sheet>
  );
}

function MinDueSheet({ st, cardId, onClose }: { st: Statement | null; cardId: string; onClose: () => void }) {
  const [v, setV] = useState("");
  if (!st) return null;
  return (
    <Sheet open onClose={onClose} title="Minimum due">
      <p className="mb-2 text-sm text-muted">Default is max(5% of total, ₹200) plus EMIs due. Override with the figure on your statement.</p>
      <Field label="Minimum due (₹)"><Input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder={String(st.min_due)} autoFocus /></Field>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => { setMinDueOverride(cardId, st.start, st.end, null); onClose(); }}>Reset to default</Button>
        <Button variant="primary" className="flex-1" disabled={!parseAmount(v)} onClick={() => { setMinDueOverride(cardId, st.start, st.end, parseAmount(v)); onClose(); }}>Save</Button>
      </div>
    </Sheet>
  );
}
