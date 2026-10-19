"use client";

import { useMemo, useState } from "react";
import { IpoForm } from "@/components/IpoForm";
import { INVEST_TABS, SubTabs } from "@/components/PlanTabs";
import { Amount, Badge, Button, Card, Chip, Field, Input, PageHeader, Segmented, Select, Sheet, Stat } from "@/components/ui";
import { fmtDate, istDate, relativeDay } from "@/lib/domain/dates";
import { appliedShares, blockedAmount, IPO_STAGES, ipoStats, issuePrice, listingGainPct, taxEstimate } from "@/lib/domain/ipo";
import { formatINR, parseAmount } from "@/lib/domain/money";
import { deleteIpo, getProfile, recordAllotment, recordListing, recordSale } from "@/lib/store/actions";
import { useData, useToday } from "@/lib/store/selectors";
import type { IpoApplication } from "@/lib/types";

export default function IpoPage() {
  const d = useData();
  const p = getProfile(d);
  const today = useToday();
  const [who, setWho] = useState("all");
  const [open, setOpen] = useState<IpoApplication | null>(null);
  const [adding, setAdding] = useState(false);
  const apps = useMemo(() => d.ipo_applications.filter((a) => who === "all" || a.applicant === who).sort((a, b) => b.applied_date.localeCompare(a.applied_date)), [d.ipo_applications, who]);
  const stats = ipoStats(apps);
  const applicants = ["self", ...p.family_pans];

  return (
    <div>
      <PageHeader title="Invest" subtitle="IPO applications from bid to sale" action={<Button size="sm" onClick={() => setAdding(true)}>+ IPO</Button>} />
      <SubTabs tabs={INVEST_TABS} />
      {applicants.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar">
          <Chip active={who === "all"} onClick={() => setWho("all")}>Combined</Chip>
          {applicants.map((a) => <Chip key={a} active={who === a} onClick={() => setWho(a)}>{a === "self" ? "Me" : a}</Chip>)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Capital blocked now" value={stats.blockedNow} />
        <Stat label="Lifetime P&L" value={stats.lifetimePnl} tone="auto" />
        <Stat label="Total applied" value={stats.totalApplied} sub={`${stats.applied} applications`} />
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="text-xs text-muted">Allotment hit-rate</p>
          <p className="mt-0.5 text-lg font-semibold">{stats.hitRate === null ? "—" : `${Math.round(stats.hitRate * 100)}%`}</p>
          {stats.best && <p className="mt-0.5 truncate text-xs text-muted">Best: {stats.best.a.company} {formatINR(stats.best.pnl, { sign: true })}</p>}
        </div>
      </div>

      <div className="-mx-4 mt-5 flex snap-x gap-3 overflow-x-auto px-4 pb-4 no-scrollbar md:mx-0 md:px-0">
        {IPO_STAGES.map((stage) => {
          const list = apps.filter((a) => stage.statuses.includes(a.status));
          return (
            <section key={stage.key} className="w-64 shrink-0 snap-start" aria-label={stage.label}>
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{stage.label}</h2>
                <Badge>{list.length}</Badge>
              </div>
              <div className="space-y-2">
                {list.map((a) => (
                  <Card key={a.id} onClick={() => setOpen(a)} className="p-3">
                    <p className="truncate text-sm font-semibold">{a.company}</p>
                    <p className="text-xs text-muted">{a.lots} lot × {a.lot_size} @ {formatINR(a.bid_price)}{a.applicant !== "self" && ` · ${a.applicant}`}</p>
                    <IpoLine a={a} today={today} />
                  </Card>
                ))}
                {list.length === 0 && <div className="rounded-2xl border border-dashed border-line p-4 text-center text-xs text-muted">Empty</div>}
              </div>
            </section>
          );
        })}
      </div>

      <IpoDetail app={open ? d.ipo_applications.find((a) => a.id === open.id) ?? null : null} onClose={() => setOpen(null)} />
      <Sheet open={adding} onClose={() => setAdding(false)} title="New IPO application"><IpoForm onDone={() => setAdding(false)} /></Sheet>
    </div>
  );
}

function IpoLine({ a, today }: { a: IpoApplication; today: string }) {
  if (a.status === "applied" || a.status === "blocked")
    return <p className="mt-1 text-xs"><Amount value={blockedAmount(a.lots, a.lot_size, a.bid_price)} className="font-medium text-warn" /> blocked{a.allotment_date && ` · allotment ${relativeDay(a.allotment_date, today).toLowerCase()}`}</p>;
  if (a.status === "not_allotted") return <p className="mt-1 text-xs text-muted">Refund {a.refund_received ? "received" : "pending"}</p>;
  if (a.status === "sold") return <p className="mt-1 text-xs">P&L <Amount value={a.realised_pnl ?? 0} tone="auto" className="font-medium" sign /></p>;
  const g = listingGainPct(a);
  return (
    <p className="mt-1 text-xs">
      {a.shares_allotted - a.shares_sold} shares{g !== null && <> · listed <span className={g >= 0 ? "text-good" : "text-bad"}>{(g * 100).toFixed(1)}%</span></>}
      {a.listing_date && g === null && ` · lists ${relativeDay(a.listing_date, today).toLowerCase()}`}
    </p>
  );
}

function IpoDetail({ app, onClose }: { app: IpoApplication | null; onClose: () => void }) {
  const d = useData();
  const p = getProfile(d);
  const [mode, setMode] = useState<"view" | "allot" | "list" | "sell" | "edit">("view");
  const [shares, setShares] = useState("");
  const [allotKind, setAllotKind] = useState<"full" | "none" | "partial">("full");
  const [issue, setIssue] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(istDate());
  const [demat, setDemat] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  if ((app?.id ?? null) !== lastId) {
    setLastId(app?.id ?? null);
    setMode("view");
    setShares("");
    setIssue(app ? String(app.issue_price ?? app.bid_price) : "");
    setPrice("");
    setQty(app ? String(app.shares_allotted - app.shares_sold) : "");
  }
  if (!app) return null;
  const dematAccounts = d.accounts.filter((a) => a.type === "demat" && !a.archived);
  const pending = app.status === "applied" || app.status === "blocked";
  const held = app.shares_allotted - app.shares_sold;
  const tax = taxEstimate(app, p.stcg_rate, p.ltcg_rate);
  const g = listingGainPct(app);

  return (
    <Sheet open onClose={onClose} title={app.company}>
      {mode === "edit" ? (
        <IpoForm initial={app} onDone={() => setMode("view")} />
      ) : mode === "allot" ? (
        <div>
          <Segmented value={allotKind} onChange={setAllotKind} options={[{ value: "full", label: "Allotted" }, { value: "partial", label: "Partial" }, { value: "none", label: "Not allotted" }]} />
          {allotKind === "partial" && <div className="mt-3"><Field label={`Shares allotted (applied ${appliedShares(app)})`}><Input inputMode="numeric" value={shares} onChange={(e) => setShares(e.target.value)} /></Field></div>}
          {allotKind !== "none" && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Final issue price"><Input inputMode="decimal" value={issue} onChange={(e) => setIssue(e.target.value)} /></Field>
              <Field label="Demat account">
                <Select value={demat} onChange={(e) => setDemat(e.target.value)}>
                  {dematAccounts.length === 0 && <option value="">(none — add in Settings)</option>}
                  {dematAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
            </div>
          )}
          <Field label="Allotment date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <p className="mb-3 text-xs text-muted">
            {allotKind === "none" ? `The ${formatINR(blockedAmount(app.lots, app.lot_size, app.bid_price))} hold is released.` : "The allotted amount moves to your demat as an investment; the rest of the hold is released."}
          </p>
          <Button variant="primary" className="w-full" onClick={() => {
            const n = allotKind === "none" ? 0 : allotKind === "full" ? appliedShares(app) : parseInt(shares) || 0;
            recordAllotment(app, n, date, demat || dematAccounts[0]?.id || null, parseAmount(issue) ?? undefined);
            setMode("view");
          }}>Save allotment</Button>
        </div>
      ) : mode === "list" ? (
        <div>
          <Field label="Listing price"><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus /></Field>
          <Button variant="primary" className="w-full" disabled={!parseAmount(price)} onClick={() => { recordListing(app, parseAmount(price)!); setMode("view"); }}>Save listing</Button>
        </div>
      ) : mode === "sell" ? (
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sell price"><Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus /></Field>
            <Field label={`Quantity (held ${held})`}><Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          </div>
          <Field label="Sold on"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          {parseAmount(price) && <p className="mb-3 text-sm">P&L ≈ <Amount value={(parseAmount(price)! - issuePrice(app)) * (parseInt(qty) || 0)} tone="auto" sign /></p>}
          <Button variant="primary" className="w-full" disabled={!parseAmount(price) || !(parseInt(qty) > 0) || parseInt(qty) > held} onClick={() => { recordSale(app, parseAmount(price)!, parseInt(qty), date); setMode("view"); }}>Record sale</Button>
        </div>
      ) : (
        <div>
          <dl className="divide-y divide-line rounded-2xl border border-line text-sm">
            {([
              ["Status", <Badge key="s" tone={pending ? "warn" : app.status === "not_allotted" ? "neutral" : "good"}>{app.status.replace("_", " ")}</Badge>],
              ["Category / PAN", `${app.category} · ${app.applicant}`],
              ["Bid", `${app.lots} lot × ${app.lot_size} @ ${formatINR(app.bid_price)}`],
              ["Amount blocked", formatINR(blockedAmount(app.lots, app.lot_size, app.bid_price))],
              ["Price band", app.price_band_low ? `${formatINR(app.price_band_low)} – ${formatINR(app.price_band_high ?? 0)}` : "—"],
              ["Applied", fmtDate(app.applied_date, true)],
              ["UPI mandate by", app.mandate_date ? fmtDate(app.mandate_date) : "—"],
              ["Allotment", app.allotment_date ? fmtDate(app.allotment_date) : "—"],
              ["Listing", app.listing_date ? fmtDate(app.listing_date) : "—"],
              ...(app.shares_allotted ? [["Shares allotted", `${app.shares_allotted} @ ${formatINR(issuePrice(app))}`]] : []),
              ...(app.listing_price ? [["Listing price", <span key="l">{formatINR(app.listing_price)} <span className={g! >= 0 ? "text-good" : "text-bad"}>({(g! * 100).toFixed(1)}%)</span></span>]] : []),
              ...(app.shares_sold ? [["Sold", `${app.shares_sold} @ ${formatINR(app.sell_price ?? 0)} on ${app.sold_date ? fmtDate(app.sold_date) : ""}`], ["Realised P&L", <Amount key="p" value={app.realised_pnl ?? 0} tone="auto" sign />], [`${tax.kind} tax estimate`, `${formatINR(tax.tax)} @ ${tax.kind === "STCG" ? p.stcg_rate : p.ltcg_rate}%`]] : []),
            ] as [string, React.ReactNode][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-3 py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {pending && <Button variant="primary" className="col-span-2" onClick={() => setMode("allot")}>Record allotment</Button>}
            {held > 0 && app.listing_price === null && <Button onClick={() => setMode("list")}>Listing price</Button>}
            {held > 0 && <Button onClick={() => setMode("sell")}>Sell</Button>}
            <Button onClick={() => setMode("edit")}>Edit</Button>
            <Button variant="danger" onClick={() => { deleteIpo(app); onClose(); }}>Delete</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
