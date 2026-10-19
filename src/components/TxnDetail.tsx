"use client";

import { useEffect, useState } from "react";
import { emiSchedule } from "@/lib/domain/cards";
import { fmtDate, istDate } from "@/lib/domain/dates";
import { budgetImpact, refundableLeft } from "@/lib/domain/ledger";
import { formatINR, parseAmount } from "@/lib/domain/money";
import { addRefund, categoryPath, confirmDraft, convertToEmi, deleteTransactions, restoreTransactions, saveTemplate } from "@/lib/store/actions";
import { useData, useLookups } from "@/lib/store/selectors";
import { receiptUrl } from "@/lib/receipts";
import type { Transaction } from "@/lib/types";
import { TxnForm } from "./TxnForm";
import { Amount, Badge, Button, Field, Input, Segmented, Sheet } from "./ui";

export function TxnDetailSheet({ txn, onClose }: { txn: Transaction | null; onClose: () => void }) {
  const d = useData();
  const t = txn ? d.transactions.find((x) => x.id === txn.id) ?? txn : null;
  const [mode, setMode] = useState<"view" | "edit" | "refund" | "emi">("view");
  useEffect(() => setMode("view"), [txn?.id]);
  if (!t) return null;
  return (
    <Sheet open={!!t} onClose={onClose} title={mode === "edit" ? "Edit transaction" : mode === "refund" ? "Record refund" : mode === "emi" ? "Convert to EMI" : "Transaction"}>
      {mode === "edit" ? (
        <TxnForm initial={t} onDone={() => setMode("view")} autoFocusNl={false} />
      ) : mode === "refund" ? (
        <RefundForm t={t} onDone={() => setMode("view")} />
      ) : mode === "emi" ? (
        <EmiForm t={t} onDone={() => setMode("view")} />
      ) : (
        <Detail t={t} setMode={setMode} onClose={onClose} />
      )}
    </Sheet>
  );
}

function Detail({ t, setMode, onClose }: { t: Transaction; setMode: (m: "edit" | "refund" | "emi") => void; onClose: () => void }) {
  const d = useData();
  const { acc, friend } = useLookups();
  const [img, setImg] = useState<string | null>(null);
  const [draftAmt, setDraftAmt] = useState(String(t.amount));
  useEffect(() => {
    if (t.receipt_path) receiptUrl(t.receipt_path).then(setImg);
  }, [t.receipt_path]);
  const splits = d.transaction_splits.filter((s) => s.transaction_id === t.id);
  const refunds = d.transactions.filter((x) => x.refund_of === t.id && !x.deleted_at);
  const original = t.refund_of ? d.transactions.find((x) => x.id === t.refund_of) : null;
  const emi = t.emi_id ? d.card_emis.find((e) => e.id === t.emi_id) : null;
  const history = d.audit_log.filter((a) => a.entity_id === t.id).sort((a, b) => b.at.localeCompare(a.at));
  const isCardSwipe = t.type === "expense" && t.account_id && d.credit_cards.some((c) => c.account_id === t.account_id) && !t.emi_id;
  const rows: [string, React.ReactNode][] = [
    ["Type", t.type.replace("_", " ")],
    ["Date", `${fmtDate(istDate(t.occurred_at), true)}, ${new Date(t.occurred_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}`],
    ["Category", categoryPath(t.category_id, d.categories)],
    ["Account", t.paid_by_friend_id ? `Paid by ${friend.get(t.paid_by_friend_id)?.name}` : (t.account_id && acc.get(t.account_id)?.name) || "—"],
    ...(t.to_account_id ? [["To", acc.get(t.to_account_id)?.name ?? "—"] as [string, string]] : []),
    ["Method", t.method.replace("_", " ").toUpperCase()],
    ["Budget impact", <Amount key="b" value={budgetImpact(t)} />],
    ...(t.note ? [["Note", t.note] as [string, string]] : []),
    ...(t.tags.length ? [["Tags", t.tags.map((x) => `#${x}`).join(" ")] as [string, string]] : []),
    ...(t.location ? [["Location", <a key="l" className="text-accent" href={`https://maps.google.com/?q=${t.location}`} target="_blank" rel="noreferrer">{t.location}</a>] as [string, React.ReactNode]] : []),
  ];

  return (
    <div>
      <div className="mb-4 text-center">
        <p className="text-sm text-muted">{t.merchant ?? "—"}</p>
        <p className="text-3xl font-bold"><Amount value={t.amount} /></p>
        {t.my_share !== null && <p className="text-sm text-muted">Your share <Amount value={t.my_share} /></p>}
        <div className="mt-1 flex justify-center gap-1">
          {t.deleted_at && <Badge tone="bad">in trash</Badge>}
          {t.is_draft && <Badge tone="warn">awaiting confirmation</Badge>}
          {t.exclude_from_budget && <Badge>excluded from budget</Badge>}
        </div>
      </div>

      {t.is_draft && (
        <div className="mb-4 rounded-xl border border-warn/40 bg-warn/10 p-3">
          <Field label="Confirm the actual amount">
            <Input inputMode="decimal" value={draftAmt} onChange={(e) => setDraftAmt(e.target.value)} />
          </Field>
          <Button variant="primary" className="w-full" onClick={() => confirmDraft(t, parseAmount(draftAmt) ?? t.amount)}>Confirm</Button>
        </div>
      )}

      <dl className="divide-y divide-line rounded-2xl border border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-3 py-2.5 text-sm">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right capitalize-first">{v}</dd>
          </div>
        ))}
      </dl>

      {splits.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Split ({t.split_mode})</p>
          <div className="rounded-2xl border border-line">
            {splits.map((s) => (
              <div key={s.id} className="flex justify-between px-3 py-2 text-sm">
                <span>{s.friend_id ? friend.get(s.friend_id)?.name : "Me"}</span>
                <Amount value={s.share} decimals={s.share % 1 !== 0} />
              </div>
            ))}
            {t.payers && (
              <p className="border-t border-line px-3 py-2 text-xs text-muted">
                Paid by {t.payers.map((p) => `${p.friend_id ? friend.get(p.friend_id)?.name : "me"} ${formatINR(p.amount)}`).join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      {(refunds.length > 0 || original) && (
        <div className="mt-4 text-sm">
          {original && <p className="text-muted">Refund of {original.merchant} · {formatINR(original.amount)} on {fmtDate(istDate(original.occurred_at))}</p>}
          {refunds.map((r) => (
            <p key={r.id} className="text-good">↩ Refund {formatINR(r.amount)} on {fmtDate(istDate(r.occurred_at))}</p>
          ))}
        </div>
      )}

      {emi && (
        <div className="mt-4 rounded-2xl border border-line p-3 text-sm">
          <p className="font-medium">EMI · {emi.tenure_months} months @ {emi.annual_rate}%</p>
          {emiSchedule(emi).slice(0, 12).map((i) => (
            <div key={i.n} className="flex justify-between text-xs text-muted">
              <span>{fmtDate(i.date)}</span>
              <span>{formatINR(i.principal)} + {formatINR(i.interest + i.gst, { decimals: true })} int+GST</span>
            </div>
          ))}
        </div>
      )}

      {img && (
        <a href={img} target="_blank" rel="noreferrer" className="mt-4 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt="Receipt" className="max-h-64 w-full rounded-xl object-cover" />
        </a>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {t.deleted_at ? (
          <Button className="col-span-2" onClick={() => restoreTransactions([t.id])}>Restore</Button>
        ) : (
          <>
            <Button onClick={() => setMode("edit")}>✏️ Edit</Button>
            {t.type === "expense" && refundableLeft(t, d.transactions) > 0 && <Button onClick={() => setMode("refund")}>↩ Refund</Button>}
            {isCardSwipe && t.amount >= 2500 && <Button onClick={() => setMode("emi")}>📆 Convert to EMI</Button>}
            {t.type === "expense" && t.merchant && (
              <Button onClick={() => saveTemplate(t.merchant!, `${t.amount} ${t.merchant} ${t.method === "card" ? "card" : t.method}`, d.categories.find((c) => c.id === t.category_id)?.icon ?? "⭐")}>⭐ Save as template</Button>
            )}
            <Button variant="danger" onClick={() => { deleteTransactions([t.id]); onClose(); }}>🗑 Delete</Button>
          </>
        )}
      </div>

      {history.length > 0 && (
        <details className="mt-4 text-xs text-muted">
          <summary className="min-h-11 cursor-pointer">Edit history ({history.length})</summary>
          {history.map((h) => {
            const b = h.before as Partial<Transaction> | null;
            return (
              <p key={h.id} className="py-1">
                {new Date(h.at).toLocaleString("en-IN")} · {h.action}
                {b && ` · was ${formatINR(b.amount ?? 0)} ${b.merchant ?? ""}`}
              </p>
            );
          })}
        </details>
      )}
    </div>
  );
}

function RefundForm({ t, onDone }: { t: Transaction; onDone: () => void }) {
  const d = useData();
  const left = refundableLeft(t, d.transactions);
  const [amt, setAmt] = useState(String(left));
  const [date, setDate] = useState(istDate());
  const a = parseAmount(amt) ?? 0;
  return (
    <div>
      <p className="mb-3 text-sm text-muted">Refund for {t.merchant ?? "this purchase"} · up to {formatINR(left)}. It goes back to the original account and category.</p>
      <Field label="Refund amount"><Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
      <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Button variant="primary" className="w-full" disabled={a <= 0 || a > left} onClick={() => { addRefund(t, a, date); onDone(); }}>
        Record {a < left ? "partial " : ""}refund
      </Button>
    </div>
  );
}

function EmiForm({ t, onDone }: { t: Transaction; onDone: () => void }) {
  const [tenure, setTenure] = useState("6");
  const [rate, setRate] = useState("15");
  const [fee, setFee] = useState("199");
  const sched = emiSchedule({ principal: t.amount, tenure_months: parseInt(tenure) || 1, annual_rate: parseFloat(rate) || 0, gst_pct: 18, start_date: istDate() });
  const totalInt = sched.reduce((a, i) => a + i.interest + i.gst, 0);
  return (
    <div>
      <Segmented value={tenure} onChange={setTenure} options={["3", "6", "9", "12", "18", "24"].map((v) => ({ value: v, label: `${v} mo` }))} />
      <div className="mt-3 grid grid-cols-2 gap-x-3">
        <Field label="Interest rate (% p.a.)"><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
        <Field label="Processing fee (₹)"><Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
      </div>
      <div className="rounded-xl bg-surface-2 p-3 text-sm">
        <p>Monthly ≈ <b>{formatINR(sched[0]?.total ?? 0, { decimals: true })}</b> (principal + interest + 18% GST on interest)</p>
        <p className="text-muted">Total interest + GST {formatINR(totalInt, { decimals: true })} · fee {formatINR((parseFloat(fee) || 0) * 1.18, { decimals: true })}</p>
        <p className="mt-1 text-xs text-muted">The swipe leaves statements; each month&apos;s installment is added instead and counts in full toward the minimum due.</p>
      </div>
      <Button variant="primary" className="mt-3 w-full" onClick={() => { convertToEmi(t, parseInt(tenure), parseFloat(rate) || 0, parseFloat(fee) || 0); onDone(); }}>
        Convert to EMI
      </Button>
    </div>
  );
}
