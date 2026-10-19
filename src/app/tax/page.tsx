"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Amount, Badge, Button, Card, PageHeader, SectionTitle } from "@/components/ui";
import { addDays, fmtDate, istDate } from "@/lib/domain/dates";
import { formatINR } from "@/lib/domain/money";
import { capitalGains, fyRange, rentSummary, section80C } from "@/lib/domain/tax";
import { download, toCsv } from "@/lib/data";
import { getProfile } from "@/lib/store/actions";
import { useData, useToday } from "@/lib/store/selectors";

export default function TaxPage() {
  const d = useData();
  const p = getProfile(d);
  const today = useToday();
  const [anchor, setAnchor] = useState(today);
  const fy = fyRange(anchor);
  const rent = useMemo(() => rentSummary(d.recurring_rules, d.transactions, fy.from, fy.to), [d, fy.from, fy.to]);
  const cg = useMemo(() => capitalGains(d.ipo_applications, fy.from, fy.to, p.stcg_rate, p.ltcg_rate), [d, fy.from, fy.to, p.stcg_rate, p.ltcg_rate]);
  const c80 = useMemo(() => section80C(d.transactions, fy.from, fy.to), [d, fy.from, fy.to]);

  function exportAll() {
    const rows = [
      ...rent.payments.map((t) => ({ section: "Rent (HRA)", date: istDate(t.occurred_at), description: t.merchant ?? "Rent", amount: t.amount, tax: "" })),
      ...cg.rows.map((r) => ({ section: `IPO ${r.kind}`, date: r.app.sold_date ?? "", description: `${r.app.company} · ${r.app.shares_sold} sh @ ${r.app.sell_price}`, amount: r.gain, tax: r.tax })),
      ...c80.rows.map((t) => ({ section: "80C", date: istDate(t.occurred_at), description: t.merchant ?? t.note ?? "", amount: t.amount, tax: "" })),
    ];
    download(`paisa-os-tax-FY${fy.label}.csv`, toCsv(rows), "text/csv");
  }

  return (
    <div>
      <PageHeader back="/more" title="Tax helper" subtitle={`FY ${fy.label} · prepares data, never files`} action={<Button size="sm" onClick={exportAll}>Export CSV</Button>} />
      <div className="mb-3 flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => setAnchor(addDays(fy.from, -1))}>‹ FY</Button>
        <span className="text-sm text-muted">{fmtDate(fy.from, true)} – {fmtDate(fy.to, true)}</span>
        <Button size="sm" variant="ghost" disabled={fy.to >= today} onClick={() => setAnchor(addDays(fy.to, 1))}>FY ›</Button>
      </div>

      <SectionTitle>Rent paid (HRA)</SectionTitle>
      <Card>
        <p className="text-2xl font-bold"><Amount value={rent.total} /></p>
        <p className="text-xs text-muted">{rent.payments.length} payments{rent.landlordPanNeeded && " · landlord PAN required (rent above ₹1,00,000/yr)"}</p>
        {rent.landlordPanNeeded && rent.rules.some((r) => !r.landlord_pan) && <p className="mt-1 text-xs text-warn">Add your landlord&apos;s PAN in Plan → Recurring → Rent.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {rent.rules.map((r) => (
            <Link key={r.id} href={`/rent-receipt?rule=${r.id}&from=${fy.from}&to=${fy.to}`} className="inline-flex h-10 items-center rounded-xl border border-line bg-surface-2 px-3 text-sm">🧾 Receipts · {r.landlord ?? r.name}</Link>
          ))}
        </div>
      </Card>

      <SectionTitle>IPO capital gains</SectionTitle>
      <Card>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div><p className="text-xs text-muted">STCG</p><Amount value={cg.stcg} tone="auto" className="font-semibold" /></div>
          <div><p className="text-xs text-muted">LTCG</p><Amount value={cg.ltcg} tone="auto" className="font-semibold" /></div>
          <div><p className="text-xs text-muted">Est. tax</p><Amount value={cg.tax} className="font-semibold" /></div>
        </div>
        <div className="mt-3 space-y-1">
          {cg.rows.map((r) => (
            <div key={r.app.id} className="flex justify-between text-sm">
              <span>{r.app.company} <Badge>{r.kind}</Badge></span>
              <span><Amount value={r.gain} tone="auto" sign /> · tax {formatINR(r.tax)}</span>
            </div>
          ))}
          {cg.rows.length === 0 && <p className="text-sm text-muted">No IPO sales this year.</p>}
        </div>
        <p className="mt-2 text-[11px] text-muted">Rates from Settings: STCG {p.stcg_rate}%, LTCG {p.ltcg_rate}%. Estimates only.</p>
      </Card>

      <SectionTitle>Section 80C</SectionTitle>
      <Card>
        <p className="text-2xl font-bold"><Amount value={c80.total} /></p>
        <p className="text-xs text-muted">Counts up to {formatINR(150000)} · tag transactions <b>#80c</b> or name them ELSS/PPF/EPF/LIC</p>
        <div className="mt-2 space-y-1">
          {c80.rows.map((t) => (
            <div key={t.id} className="flex justify-between text-sm"><span>{fmtDate(istDate(t.occurred_at))} · {t.merchant ?? t.note}</span><Amount value={t.amount} /></div>
          ))}
        </div>
      </Card>
    </div>
  );
}
