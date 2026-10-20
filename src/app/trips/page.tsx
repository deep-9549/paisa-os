"use client";

import { Plane } from "lucide-react";
import { useMemo, useState } from "react";
import { TxnDetailSheet } from "@/components/TxnDetail";
import { TxnRow } from "@/components/TxnRow";
import { Amount, Button, Card, Empty, Field, Input, PageHeader, Progress, SectionTitle, Sheet, Toggle, cn } from "@/components/ui";
import { addDays, fmtDate } from "@/lib/domain/dates";
import { formatINR, parseAmount } from "@/lib/domain/money";
import { activeTrip, tripSummary, tripTag } from "@/lib/domain/trips";
import { deleteTrip, newTrip, saveTrip } from "@/lib/store/actions";
import { useData, useToday } from "@/lib/store/selectors";
import type { Transaction, Trip } from "@/lib/types";

export default function TripsPage() {
  const d = useData();
  const today = useToday();
  const [edit, setEdit] = useState<Trip | "new" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [txn, setTxn] = useState<Transaction | null>(null);
  const live = activeTrip(d.trips, today);
  const trips = [...d.trips].sort((a, b) => b.start_date.localeCompare(a.start_date));
  const upcoming = trips.filter((t) => !t.archived && t.start_date > today);
  const past = trips.filter((t) => t.archived || t.end_date < today);

  return (
    <div>
      <PageHeader back="/more" title="Trips" subtitle="A budget and a tag for each trip — spends get tagged while you're away" action={<Button size="sm" onClick={() => setEdit("new")}>+ Trip</Button>} />

      {!d.trips.length && (
        <Empty
          icon={<Plane />}
          title="Planning a trip?"
          body="Set a budget and dates. While it's on, quick-add tags every spend, converts foreign currency, and can keep it out of your monthly budget."
          action={<Button variant="primary" onClick={() => setEdit("new")}>Plan a trip</Button>}
        />
      )}

      {live && <TripCard trip={live} today={today} expanded onEdit={() => setEdit(live)} onTxn={setTxn} />}

      {upcoming.length > 0 && <SectionTitle>Coming up</SectionTitle>}
      <div className="space-y-2">
        {upcoming.map((t) => <TripCard key={t.id} trip={t} today={today} expanded={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} onEdit={() => setEdit(t)} onTxn={setTxn} />)}
      </div>

      {past.length > 0 && <SectionTitle>Past trips</SectionTitle>}
      <div className="space-y-2">
        {past.map((t) => <TripCard key={t.id} trip={t} today={today} expanded={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} onEdit={() => setEdit(t)} onTxn={setTxn} />)}
      </div>

      <TripSheet key={edit === "new" ? "new" : edit?.id ?? "none"} trip={edit} onClose={() => setEdit(null)} />
      <TxnDetailSheet txn={txn} onClose={() => setTxn(null)} />
    </div>
  );
}

function TripCard({ trip, today, expanded, onToggle, onEdit, onTxn }: { trip: Trip; today: string; expanded?: boolean; onToggle?: () => void; onEdit: () => void; onTxn: (t: Transaction) => void }) {
  const d = useData();
  const s = useMemo(() => tripSummary(trip, d.transactions, d.categories, today), [trip, d.transactions, d.categories, today]);
  const isLive = s.dayNo >= 1 && s.dayNo <= s.days && !trip.archived;
  const pct = trip.budget > 0 ? s.spent / trip.budget : 0;
  const elapsed = isLive ? s.dayNo / s.days : s.dayNo > s.days ? 1 : 0;
  return (
    <Card className={cn(isLive && "hero")}>
      <button className="block w-full text-left" onClick={onToggle} disabled={!onToggle}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{trip.emoji} {trip.name}</p>
            <p className="text-xs text-muted">
              {fmtDate(trip.start_date)} – {fmtDate(trip.end_date)} · #{trip.tag}
              {isLive && ` · day ${s.dayNo} of ${s.days}`}
              {trip.currency && trip.fx_rate && ` · ${trip.currency} @ ₹${trip.fx_rate}`}
            </p>
          </div>
          <span className="shrink-0 text-right">
            <Amount value={s.spent} className="block font-bold" />
            {trip.budget > 0 && <span className="text-xs text-muted">of {formatINR(trip.budget)}</span>}
          </span>
        </div>
        {trip.budget > 0 && (
          <div className="mt-3">
            <Progress value={pct} tone={pct > 1 ? "over" : pct > elapsed + 0.1 ? "warn" : "ok"} marker={elapsed || undefined} label="Trip budget" />
            <p className={cn("mt-1.5 text-xs", s.left < 0 ? "font-medium text-bad" : "text-muted")}>
              {s.left >= 0 ? `${formatINR(s.left)} left` : `${formatINR(-s.left)} over budget`}
              {isLive && s.left > 0 && ` · ${formatINR(Math.round(s.perDayLeft))}/day for the rest of the trip`}
            </p>
          </div>
        )}
      </button>
      {expanded && (
        <div className="mt-4 border-t border-line pt-3">
          {s.byCategory.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {s.byCategory.map((c) => (
                <div key={c.category?.id ?? "none"} className="flex justify-between text-sm">
                  <span>{c.category?.icon} {c.category?.name ?? "Uncategorised"}</span>
                  <Amount value={c.amount} className="font-medium" />
                </div>
              ))}
            </div>
          )}
          {s.txns.length ? (
            <div className="-mx-2">{s.txns.slice(0, 20).map((t) => <TxnRow key={t.id} t={t} onClick={() => onTxn(t)} />)}</div>
          ) : (
            <p className="text-sm text-muted">No spends tagged #{trip.tag} yet.</p>
          )}
          <Button size="sm" className="mt-3" onClick={onEdit}>Edit trip</Button>
        </div>
      )}
    </Card>
  );
}

function TripSheet({ trip, onClose }: { trip: Trip | "new" | null; onClose: () => void }) {
  const today = useToday();
  const existing = trip && trip !== "new" ? trip : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [emoji, setEmoji] = useState(existing?.emoji ?? "✈️");
  const [budget, setBudget] = useState(existing ? String(existing.budget || "") : "");
  const [start, setStart] = useState(existing?.start_date ?? today);
  const [end, setEnd] = useState(existing?.end_date ?? addDays(today, 3));
  const [abroad, setAbroad] = useState(!!existing?.currency);
  const [currency, setCurrency] = useState(existing?.currency ?? "USD");
  const [rate, setRate] = useState(existing?.fx_rate ? String(existing.fx_rate) : "");
  const [separate, setSeparate] = useState(existing?.separate_budget ?? true);
  const valid = name.trim() && end >= start && (!abroad || (currency.trim().length === 3 && (parseAmount(rate) ?? 0) > 0));

  const save = () => {
    const base = existing ?? newTrip({ name: name.trim(), start_date: start, end_date: end });
    saveTrip({
      ...base, name: name.trim(), emoji: emoji || "✈️", tag: existing?.tag ?? tripTag(name), budget: parseAmount(budget) ?? 0,
      start_date: start, end_date: end, currency: abroad ? currency.trim().toUpperCase() : null, fx_rate: abroad ? parseAmount(rate) : null, separate_budget: separate,
    });
    onClose();
  };

  return (
    <Sheet open={!!trip} onClose={onClose} title={existing ? "Edit trip" : "Plan a trip"}>
      <div className="grid grid-cols-[4.5rem_1fr] gap-3">
        <Field label="Emoji"><Input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="text-center text-xl" maxLength={4} /></Field>
        <Field label="Trip name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goa with college gang" autoFocus={!existing} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label="Budget (₹)" hint={name ? `Spends get tagged #${existing?.tag ?? tripTag(name)} while the trip is on.` : undefined}>
        <Input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="20,000" />
      </Field>
      <Toggle checked={separate} onChange={setSeparate} label="Paid from savings — keep out of the monthly budget" />
      <Toggle checked={abroad} onChange={setAbroad} label="Trip abroad (enter amounts in another currency)" />
      {abroad && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency"><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="USD" /></Field>
          <Field label="₹ per 1 unit"><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="83.2" /></Field>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        {existing && <Button variant="danger" onClick={() => { deleteTrip(existing.id); onClose(); }}>Delete</Button>}
        {existing && !existing.archived && existing.end_date < today && <Button onClick={() => { saveTrip({ ...existing, archived: true }); onClose(); }}>Archive</Button>}
        <Button variant="primary" className="flex-1" disabled={!valid} onClick={save}>{existing ? "Save" : "Start planning"}</Button>
      </div>
    </Sheet>
  );
}
