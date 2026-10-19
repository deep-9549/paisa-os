"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Amount, Badge, Button, Card, PageHeader, SectionTitle, Segmented } from "@/components/ui";
import { type Cycle, getCycle, previousCycle, recentCycles } from "@/lib/domain/cycle";
import { addDays, fmtDate, fmtMonth, weekdayName } from "@/lib/domain/dates";
import { anomalies, forecastMonthEnd, heatmap, monthlyReport, weekendVsWeekday, yearlyWrapped } from "@/lib/domain/insights";
import { ipoStats } from "@/lib/domain/ipo";
import { formatINR } from "@/lib/domain/money";
import { getProfile } from "@/lib/store/actions";
import { salaryDates, useData, useSafeToSpend, useToday } from "@/lib/store/selectors";

const PALETTE = ["#7c8cff", "#f97316", "#34d399", "#f472b6", "#60a5fa", "#fbbf24", "#a78bfa", "#94a3b8"];
const tooltipStyle = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)" };

export default function ReportsPage() {
  const d = useData();
  const p = getProfile(d);
  const today = useToday();
  const sts = useSafeToSpend();
  const [tab, setTab] = useState<"month" | "trends" | "heatmap" | "year">("month");
  const sd = useMemo(() => salaryDates(d), [d]);
  const [anchor, setAnchor] = useState(today);
  const cycle = useMemo(() => getCycle(anchor, p.cycle_history, sd), [anchor, p.cycle_history, sd]);
  const prev = useMemo(() => previousCycle(cycle, p.cycle_history, sd), [cycle, p.cycle_history, sd]);
  const isCurrent = today >= cycle.start && today <= cycle.end;
  const report = useMemo(() => monthlyReport(d.transactions, d.categories, cycle, prev), [d, cycle, prev]);

  return (
    <div>
      <PageHeader back="/more" title="Reports" subtitle="Where the money went" />
      <Segmented value={tab} onChange={setTab} options={[{ value: "month", label: "Monthly" }, { value: "trends", label: "Trends" }, { value: "heatmap", label: "Heatmap" }, { value: "year", label: "Wrapped" }]} />

      {tab === "month" && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={() => setAnchor(addDays(cycle.start, -1))} aria-label="Previous month">‹</Button>
            <div className="text-center">
              <p className="font-semibold">{fmtMonth(cycle.start)}</p>
              <p className="text-xs text-muted">{fmtDate(cycle.start)} – {fmtDate(cycle.end)}</p>
            </div>
            <Button size="sm" variant="ghost" disabled={isCurrent} onClick={() => setAnchor(addDays(cycle.end, 1))} aria-label="Next month">›</Button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Card className="p-3"><p className="text-[11px] text-muted">Income</p><p className="font-semibold"><Amount value={report.income} /></p></Card>
            <Card className="p-3"><p className="text-[11px] text-muted">Spent</p><p className="font-semibold"><Amount value={report.spend} /></p>{report.momChange !== null && <p className={`text-[11px] ${report.momChange > 0 ? "text-bad" : "text-good"}`}>{report.momChange > 0 ? "▲" : "▼"} {Math.abs(Math.round(report.momChange * 100))}% vs last</p>}</Card>
            <Card className="p-3"><p className="text-[11px] text-muted">Savings rate</p><p className="font-semibold">{report.savingsRate === null ? "—" : `${Math.round(report.savingsRate * 100)}%`}</p><p className="text-[11px] text-muted"><Amount value={report.savings} /></p></Card>
          </div>
          {isCurrent && <Forecast cycle={cycle} today={today} scheduled={sts.fixedCommitments + sts.variableUpcoming} />}
          {isCurrent && <Anomalies />}

          <SectionTitle>Top categories</SectionTitle>
          <Card>
            {report.topCategories.length === 0 && <p className="text-sm text-muted">No spending this month.</p>}
            {report.topCategories.map((c) => (
              <div key={c.id ?? "none"} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="w-6">{c.icon}</span>
                <span className="flex-1">{c.name}</span>
                {c.change !== null && <span className={`text-[11px] ${c.change > 0 ? "text-bad" : "text-good"}`}>{c.change > 0 ? "+" : ""}{Math.round(c.change * 100)}%</span>}
                <Amount value={c.amount} className="w-24 text-right font-medium" />
              </div>
            ))}
          </Card>

          <SectionTitle>UPI vs card vs cash</SectionTitle>
          <Card className="flex items-center gap-4">
            <div className="h-36 w-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={report.methods} dataKey="amount" nameKey="method" innerRadius={40} outerRadius={64} paddingAngle={2} stroke="none" isAnimationActive={false}>
                    {report.methods.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatINR(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1">
              {report.methods.map((m, i) => (
                <div key={m.method} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="flex-1 uppercase">{m.method}</span>
                  <Amount value={m.amount} />
                </div>
              ))}
            </div>
          </Card>

          <SectionTitle>Top merchants</SectionTitle>
          <Card>
            {report.topMerchants.map((m) => (
              <div key={m.name} className="flex justify-between py-1 text-sm"><span>{m.name} <span className="text-xs text-muted">×{m.count}</span></span><Amount value={m.amount} /></div>
            ))}
            {report.topMerchants.length === 0 && <p className="text-sm text-muted">—</p>}
          </Card>
        </>
      )}

      {tab === "trends" && <Trends />}
      {tab === "heatmap" && <Heatmap />}
      {tab === "year" && <Wrapped />}
    </div>
  );
}

function Forecast({ cycle, today, scheduled }: { cycle: Cycle; today: string; scheduled: number }) {
  const d = useData();
  const sts = useSafeToSpend();
  const f = forecastMonthEnd(d.transactions, cycle, today, scheduled);
  const room = sts.income - sts.buffer - sts.goalReserve - sts.investments - sts.holds;
  const over = f.projected > room;
  return (
    <Card className="mt-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">📈 Month-end forecast</p>
        <Badge tone={over ? "bad" : "good"}>{over ? "over" : "on track"}</Badge>
      </div>
      <p className="mt-1 text-2xl font-bold"><Amount value={f.projected} /></p>
      <p className="text-xs text-muted">Spent {formatINR(f.spent)} + run-rate {formatINR(f.runRate)}/day × days left + {formatINR(scheduled)} scheduled. Room after reserves: {formatINR(room)}.</p>
    </Card>
  );
}

function Anomalies() {
  const d = useData();
  const today = useToday();
  const p = getProfile(d);
  const list = useMemo(() => anomalies(d.transactions, d.categories, recentCycles(today, 4, p.cycle_history), today), [d, today, p.cycle_history]);
  if (!list.length) return null;
  return (
    <>
      <SectionTitle>Heads up</SectionTitle>
      <div className="space-y-2">
        {list.map((a) => (
          <Card key={a.id} className="border-warn/30">
            <p className="text-sm font-medium">{a.title}</p>
            <p className="text-xs text-muted">{a.body}</p>
          </Card>
        ))}
      </div>
    </>
  );
}

function Trends() {
  const d = useData();
  const today = useToday();
  const p = getProfile(d);
  const data = useMemo(() => {
    const cycles = recentCycles(today, 6, p.cycle_history, salaryDates(d));
    return cycles.map((c, i) => {
      const r = monthlyReport(d.transactions, d.categories, c, i > 0 ? cycles[i - 1] : previousCycle(c, p.cycle_history));
      return { label: fmtMonth(c.start).split(" ")[0], spend: r.spend, income: r.income, rate: r.savingsRate === null ? null : Math.round(r.savingsRate * 100) };
    });
  }, [d, today, p.cycle_history]);
  return (
    <>
      <SectionTitle>Income vs spend</SectionTitle>
      <Card className="h-64 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => formatINR(v, { compact: true })} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatINR(Number(v))} cursor={{ fill: "var(--surface-3)" }} />
            <Bar dataKey="income" fill="var(--good)" radius={[6, 6, 0, 0]} name="Income" />
            <Bar dataKey="spend" fill="var(--accent)" radius={[6, 6, 0, 0]} name="Spend" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <SectionTitle>Savings rate %</SectionTitle>
      <Card className="h-48 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
            <Line type="monotone" dataKey="rate" stroke="var(--good)" strokeWidth={2} dot={{ r: 3 }} connectNulls name="Savings rate" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </>
  );
}

function Heatmap() {
  const d = useData();
  const today = useToday();
  const from = addDays(today, -90);
  const grid = useMemo(() => heatmap(d.transactions, from, today), [d, from, today]);
  const ww = useMemo(() => weekendVsWeekday(d.transactions, from, today), [d, from, today]);
  const max = Math.max(1, ...grid.flat());
  const hours = [6, 8, 10, 12, 14, 16, 18, 20, 22];
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Card><p className="text-xs text-muted">Weekday / day</p><p className="text-lg font-semibold"><Amount value={ww.weekdayPerDay} /></p></Card>
        <Card><p className="text-xs text-muted">Weekend / day</p><p className="text-lg font-semibold"><Amount value={ww.weekendPerDay} /></p>{ww.weekdayPerDay > 0 && <p className="text-[11px] text-muted">{(ww.weekendPerDay / ww.weekdayPerDay).toFixed(1)}× weekdays</p>}</Card>
      </div>
      <SectionTitle>When you spend (last 90 days)</SectionTitle>
      <Card className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="grid grid-cols-[36px_repeat(24,1fr)] gap-0.5 text-[9px] text-muted">
            <span />
            {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center">{hours.includes(h) ? h : ""}</span>)}
            {grid.map((row, wd) => (
              <div key={wd} className="contents">
                <span className="flex items-center text-[11px]">{weekdayName(wd)}</span>
                {row.map((v, h) => (
                  <div key={h} className="aspect-square rounded-sm" title={`${weekdayName(wd)} ${h}:00 · ${formatINR(v)}`} style={{ background: v ? `color-mix(in srgb, var(--accent) ${Math.round((v / max) * 85) + 10}%, transparent)` : "var(--surface-2)" }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}

function Wrapped() {
  const d = useData();
  const today = useToday();
  const [year, setYear] = useState(parseInt(today.slice(0, 4)));
  const ipoPnl = ipoStats(d.ipo_applications.filter((a) => a.sold_date?.startsWith(String(year)))).lifetimePnl;
  const w = useMemo(() => yearlyWrapped(d.transactions, d.categories, year, ipoPnl), [d, year, ipoPnl]);
  const tiles: [string, string, string][] = [
    ["Total spent", formatINR(w.totalSpent), `${w.transactions} transactions`],
    ["Top merchant", w.topMerchant?.name ?? "—", w.topMerchant ? formatINR(w.topMerchant.amount) : ""],
    ["Biggest month", w.biggestMonth ? fmtMonth(`${w.biggestMonth.month}-01`) : "—", w.biggestMonth ? formatINR(w.biggestMonth.amount) : ""],
    ["Top category", w.topCategory?.name ?? "—", w.topCategory ? formatINR(w.topCategory.amount) : ""],
    ["IPO gains", formatINR(w.ipoPnl, { sign: true }), "realised"],
    ["Spent with friends", formatINR(w.withFriends), "total of shared bills"],
  ];
  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => setYear(year - 1)}>‹</Button>
        <p className="text-lg font-bold">{year} Wrapped</p>
        <Button size="sm" variant="ghost" disabled={year >= parseInt(today.slice(0, 4))} onClick={() => setYear(year + 1)}>›</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(([k, v, s], i) => (
          <div key={k} className="rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${PALETTE[i]}40, var(--surface))` }}>
            <p className="text-xs text-muted">{k}</p>
            <p className="amount mt-1 truncate text-lg font-bold">{v}</p>
            <p className="amount text-[11px] text-muted">{s}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
