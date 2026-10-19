"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { INVEST_TABS, SubTabs } from "@/components/PlanTabs";
import { Amount, Badge, Button, Card, Empty, Field, Input, PageHeader, Row, SectionTitle, Select, Sheet, Stat, Textarea } from "@/components/ui";
import { fmtDate, istDate } from "@/lib/domain/dates";
import { formatINR, parseAmount } from "@/lib/domain/money";
import { nextOccurrence } from "@/lib/domain/recurring";
import { deleteHolding, saveHolding } from "@/lib/store/actions";
import { useData, useNetWorth, useToday } from "@/lib/store/selectors";
import type { Holding } from "@/lib/types";

export default function PortfolioPage() {
  const d = useData();
  const today = useToday();
  const nw = useNetWorth();
  const [edit, setEdit] = useState<Holding | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const value = d.holdings.reduce((a, h) => a + h.quantity * h.current_price, 0);
  const cost = d.holdings.reduce((a, h) => a + h.quantity * h.avg_cost, 0);
  const sips = d.recurring_rules.filter((r) => r.kind === "sip" && r.active);
  const chart = useMemo(() => [...d.net_worth_snapshots].sort((a, b) => a.date.localeCompare(b.date)).map((s) => ({ date: s.date, value: s.value })), [d.net_worth_snapshots]);

  return (
    <div>
      <PageHeader title="Invest" subtitle="Holdings, SIPs and net worth" action={<Button size="sm" onClick={() => setEdit("new")}>+ Holding</Button>} />
      <SubTabs tabs={INVEST_TABS} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Net worth" value={nw.total} sub={`Investments ${formatINR(nw.investments, { compact: true })}`} />
        <Stat label="Portfolio value" value={value} sub={<>P&L <Amount value={value - cost} tone="auto" sign /></>} />
        <Stat label="Monthly SIPs" value={sips.reduce((a, r) => a + r.amount, 0)} sub={`${sips.length} active`} />
      </div>

      <SectionTitle>Net worth over time</SectionTitle>
      <Card className="h-56 p-2">
        {chart.length < 2 ? (
          <p className="flex h-full items-center justify-center text-center text-sm text-muted">A snapshot is saved every day. Check back tomorrow for the trend.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(v) => fmtDate(v)} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={30} />
              <YAxis tickFormatter={(v) => formatINR(v, { compact: true })} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12 }} labelFormatter={(v) => fmtDate(String(v), true)} formatter={(v) => [formatINR(Number(v)), "Net worth"]} />
              <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="url(#nw)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>
      <p className="mt-1 px-1 text-[11px] text-muted">Accounts {formatINR(nw.liquid)} + investments {formatINR(nw.investments)} + receivables {formatINR(nw.receivables)} − payables {formatINR(nw.payables)} − card dues {formatINR(nw.cards)} − loans {formatINR(nw.loans)}</p>

      <SectionTitle action={<button className="min-h-11 text-xs text-accent" onClick={() => setImporting(true)}>Import CSV</button>}>Holdings</SectionTitle>
      {d.holdings.length === 0 ? (
        <Empty icon="📈" title="No holdings" body="Add stocks and mutual funds manually or import a CAS/broker CSV. IPO allotments appear here automatically." />
      ) : (
        <Card className="p-1">
          {d.holdings.map((h) => {
            const v = h.quantity * h.current_price;
            const pl = v - h.quantity * h.avg_cost;
            return (
              <Row key={h.id} onClick={() => setEdit(h)} left={h.kind === "mf" ? "🧺" : h.ipo_application_id ? "🚀" : "📈"} title={<>{h.name} {h.symbol && <Badge>{h.symbol}</Badge>}</>} sub={`${h.quantity} @ ${formatINR(h.avg_cost, { decimals: h.avg_cost % 1 !== 0 })} · as of ${fmtDate(h.as_of)}`} right={<div><Amount value={v} className="font-medium" /><div className="text-[11px]"><Amount value={pl} tone="auto" sign /></div></div>} />
            );
          })}
        </Card>
      )}

      <SectionTitle>SIPs</SectionTitle>
      <Card className="p-1">
        {sips.length === 0 && <p className="py-4 text-center text-sm text-muted">Add a SIP in Plan → Recurring (kind: sip). It auto-posts as a transfer and counts as a commitment, not spend.</p>}
        {sips.map((r) => {
          const n = nextOccurrence(r, today);
          return <Row key={r.id} left="🔁" title={r.name} sub={n ? `next ${fmtDate(n)}` : ""} right={<Amount value={r.amount} />} />;
        })}
      </Card>

      <HoldingSheet h={edit} onClose={() => setEdit(null)} />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

function HoldingSheet({ h, onClose }: { h: Holding | "new" | null; onClose: () => void }) {
  const d = useData();
  const ex = h && h !== "new" ? h : null;
  const key = ex?.id ?? String(h);
  const [f, setF] = useState({ name: "", symbol: "", kind: "stock", quantity: "", avg_cost: "", current_price: "", account_id: "" });
  const [last, setLast] = useState(key);
  if (key !== last) {
    setLast(key);
    setF(ex ? { name: ex.name, symbol: ex.symbol ?? "", kind: ex.kind, quantity: String(ex.quantity), avg_cost: String(ex.avg_cost), current_price: String(ex.current_price), account_id: ex.account_id ?? "" } : { name: "", symbol: "", kind: "stock", quantity: "", avg_cost: "", current_price: "", account_id: "" });
  }
  const valid = f.name && parseFloat(f.quantity) > 0;
  return (
    <Sheet open={!!h} onClose={onClose} title={ex ? "Edit holding" : "Add holding"}>
      <div className="grid grid-cols-2 gap-x-3">
        <div className="col-span-2"><Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field></div>
        <Field label="Symbol"><Input value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value.toUpperCase() })} /></Field>
        <Field label="Type">
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="stock">Stock</option>
            <option value="mf">Mutual fund</option>
            <option value="etf">ETF</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Quantity / units"><Input inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
        <Field label="Avg cost"><Input inputMode="decimal" value={f.avg_cost} onChange={(e) => setF({ ...f, avg_cost: e.target.value })} /></Field>
        <Field label="Current price / NAV"><Input inputMode="decimal" value={f.current_price} onChange={(e) => setF({ ...f, current_price: e.target.value })} /></Field>
        <Field label="Account">
          <Select value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })}>
            <option value="">—</option>
            {d.accounts.filter((a) => a.type === "demat").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="mt-2 flex gap-2">
        {ex && <Button variant="danger" onClick={() => { deleteHolding(ex.id); onClose(); }}>Delete</Button>}
        <Button variant="primary" className="flex-1" disabled={!valid} onClick={() => {
          saveHolding({ ...(ex ?? {}), name: f.name, symbol: f.symbol || null, kind: f.kind as Holding["kind"], quantity: parseFloat(f.quantity), avg_cost: parseAmount(f.avg_cost) ?? 0, current_price: parseAmount(f.current_price) ?? parseAmount(f.avg_cost) ?? 0, account_id: f.account_id || null, as_of: istDate() });
          onClose();
        }}>Save</Button>
      </div>
    </Sheet>
  );
}

function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const rows = useMemo(() => parseHoldingsCsv(text), [text]);
  return (
    <Sheet open={open} onClose={onClose} title="Import holdings CSV" wide>
      <p className="mb-2 text-sm text-muted">Paste a broker/CAS export. Columns detected by header: name/instrument/scheme, symbol, qty/units/quantity, avg/average cost, ltp/nav/current price.</p>
      <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Instrument,Qty.,Avg. cost,LTP\nINFY,10,1450.5,1620"} />
      <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center text-sm text-accent">
        …or choose a file
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
      </label>
      {rows.length > 0 && <p className="text-sm">{rows.length} holdings found.</p>}
      <Button variant="primary" className="mt-3 w-full" disabled={!rows.length} onClick={() => { rows.forEach((r) => saveHolding(r)); onClose(); setText(""); }}>Import {rows.length}</Button>
    </Sheet>
  );
}

function parseHoldingsCsv(text: string): (Partial<Holding> & { name: string })[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const split = (l: string) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").trim()).slice(0, -1);
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const iName = col("instrument", "scheme", "name", "symbol");
  const iSym = col("symbol", "isin");
  const iQty = col("qty", "quantity", "units");
  const iAvg = col("avg", "average", "cost");
  const iLtp = col("ltp", "nav", "current", "price", "close");
  if (iName < 0 || iQty < 0) return [];
  return lines.slice(1).map(split).filter((c) => c[iName]).map((c) => ({
    name: c[iName],
    symbol: iSym >= 0 && iSym !== iName ? c[iSym] || null : null,
    kind: /fund|growth|direct|plan/i.test(c[iName]) ? "mf" as const : "stock" as const,
    quantity: parseFloat(c[iQty].replace(/,/g, "")) || 0,
    avg_cost: iAvg >= 0 ? parseAmount(c[iAvg]) ?? 0 : 0,
    current_price: iLtp >= 0 ? parseAmount(c[iLtp]) ?? 0 : iAvg >= 0 ? parseAmount(c[iAvg]) ?? 0 : 0,
    as_of: istDate(),
  }));
}
