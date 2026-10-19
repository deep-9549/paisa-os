"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { TxnDetailSheet } from "@/components/TxnDetail";
import { groupByDay, TxnRow } from "@/components/TxnRow";
import { Amount, Button, Chip, Empty, Input, PageHeader, Segmented, Select, Sheet, cn } from "@/components/ui";
import { addDays, clampedDate, dayHeading, fmtDate, fmtMonth, parseDate, toDateStr } from "@/lib/domain/dates";
import { budgetImpact, isLive, spendInRange, txnDate } from "@/lib/domain/ledger";
import { formatINR } from "@/lib/domain/money";
import { bulkUpdate, categoryPath, deleteTransactions } from "@/lib/store/actions";
import { useCycle, useData, useToday } from "@/lib/store/selectors";
import type { Transaction } from "@/lib/types";

export default function ActivityPage() {
  return (
    <Suspense>
      <Activity />
    </Suspense>
  );
}

function Activity() {
  const d = useData();
  const today = useToday();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [method, setMethod] = useState("");
  const [account, setAccount] = useState("");
  const [category, setCategory] = useState(params.get("cat") ?? "");
  const [type, setType] = useState(params.get("type") ?? "");
  const [tag, setTag] = useState("");
  const [show, setShow] = useState<"live" | "drafts" | "trash">(params.get("drafts") ? "drafts" : "live");
  const [limit, setLimit] = useState(80);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Transaction | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dayFilter, setDayFilter] = useState<string | null>(params.get("day"));

  const catFamily = useMemo(() => {
    if (!category) return null;
    return new Set([category, ...d.categories.filter((c) => c.parent_id === category).map((c) => c.id)]);
  }, [category, d.categories]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return d.transactions
      .filter((t) => (show === "trash" ? !!t.deleted_at : !t.deleted_at && (show === "drafts" ? t.is_draft : true)))
      .filter((t) => !method || t.method === method)
      .filter((t) => !account || t.account_id === account || t.to_account_id === account)
      .filter((t) => !catFamily || (t.category_id && catFamily.has(t.category_id)))
      .filter((t) => !type || t.type === type)
      .filter((t) => !tag || t.tags.includes(tag))
      .filter((t) => !dayFilter || txnDate(t) === dayFilter)
      .filter((t) => {
        if (!needle) return true;
        const hay = [t.merchant, t.note, categoryPath(t.category_id, d.categories), String(t.amount), ...t.tags].join(" ").toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }, [d, q, method, account, catFamily, type, tag, show, dayFilter]);

  const groups = groupByDay(filtered.slice(0, limit));
  const total = filtered.reduce((a, t) => a + budgetImpact(t), 0);
  const allTags = [...new Set(d.transactions.flatMap((t) => t.tags))];
  const activeFilters = [method, account, category, type, tag].filter(Boolean).length;
  const filtering = activeFilters > 0 || !!q.trim() || !!dayFilter || show !== "live";
  const cycle = useCycle();
  const monthName = fmtMonth(cycle.start).split(" ")[0];
  const monthOut = spendInRange(d.transactions, cycle.start, cycle.end);
  const monthIn = d.transactions.filter((t) => isLive(t) && t.type === "income" && !t.exclude_from_budget && txnDate(t) >= cycle.start && txnDate(t) <= cycle.end).reduce((a, t) => a + t.amount, 0);

  const toggleSel = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle={filtering ? <>{filtered.length} match{filtered.length === 1 ? "" : "es"} · budget impact <Amount value={total} /></> : `${filtered.length} transactions`}
        action={
          <>
            <Button size="sm" variant={selecting ? "primary" : "secondary"} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>
              {selecting ? "Done" : "Select"}
            </Button>
          </>
        }
      />
      {!filtering && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <MonthStat label={`Spent in ${monthName}`} value={monthOut} />
          <MonthStat label="Income" value={monthIn} tone="good" />
          <MonthStat label="Saved" value={monthIn - monthOut} tone={monthIn - monthOut >= 0 ? "good" : "bad"} />
        </div>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <Input placeholder="Search merchant, note, amount, #tag…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" autoFocus={params.get("focus") === "1"} type="search" className="pl-10" />
        </div>
        <Button onClick={() => setFiltersOpen(true)} aria-label="Filters" className={cn("h-12 w-12 px-0", activeFilters > 0 && "border-accent text-accent")}>
          <SlidersHorizontal size={18} aria-hidden />
          {activeFilters ? <span className="-ml-1 text-xs">{activeFilters}</span> : null}
        </Button>
      </div>
      <div className="-mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 no-scrollbar">
        <div className="shrink-0">
          <Segmented size="sm" value={view} onChange={(v) => setView(v)} options={[{ value: "list", label: "List" }, { value: "calendar", label: "Calendar" }]} />
        </div>
        <Chip active={show === "drafts"} onClick={() => setShow(show === "drafts" ? "live" : "drafts")}>To confirm</Chip>
        <Chip active={show === "trash"} onClick={() => setShow(show === "trash" ? "live" : "trash")}>Trash</Chip>
        {["upi", "card", "cash"].map((m) => (
          <Chip key={m} active={method === m} onClick={() => setMethod(method === m ? "" : m)}>{m.toUpperCase()}</Chip>
        ))}
        {dayFilter && <Chip active onClick={() => setDayFilter(null)}>{fmtDate(dayFilter)} ✕</Chip>}
      </div>

      {view === "calendar" && <CalendarView txns={filtered} today={today} onPick={(day) => { setDayFilter(day); setView("list"); }} />}

      {view === "list" && (
        <div className="mt-4">
          {groups.length === 0 && <Empty icon={<Search />} title={show === "trash" ? "Trash is empty" : "No transactions"} body={show === "trash" ? "Deleted items stay here for 30 days." : "Try clearing filters or add one with +."} />}
          {groups.map(([day, list]) => (
            <section key={day} className="mb-3">
              <div className="sticky top-0 z-10 -mx-1 flex justify-between bg-bg/90 px-3 py-2 text-xs font-semibold text-muted backdrop-blur">
                <span>{dayHeading(day, today)}</span>
                <Amount value={-list.reduce((a, t) => a + budgetImpact(t), 0)} />
              </div>
              <div className="rounded-3xl border border-line bg-surface p-1 shadow-card">
                {list.map((t) => (
                  <TxnRow key={t.id} t={t} selectable={selecting} selected={selected.has(t.id)} onClick={() => (selecting ? toggleSel(t.id) : setOpen(t))} />
                ))}
              </div>
            </section>
          ))}
          {filtered.length > limit && (
            <Button className="w-full" onClick={() => setLimit(limit + 100)}>Load more ({filtered.length - limit})</Button>
          )}
        </div>
      )}

      {selecting && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md gap-2 px-4 md:bottom-6">
          <Button variant="primary" className="flex-1" onClick={() => setBulkOpen(true)}>Edit {selected.size}</Button>
          <Button variant="danger" onClick={() => { deleteTransactions([...selected]); setSelected(new Set()); }}>Delete</Button>
        </div>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted">Type
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All</option>
              {["expense", "income", "transfer", "refund", "card_payment", "adjustment"].map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}
            </Select>
          </label>
          <label className="text-xs text-muted">Method
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">All</option>
              {["upi", "card", "cash", "netbanking", "auto_debit", "other"].map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </label>
          <label className="text-xs text-muted">Account
            <Select value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">All</option>
              {d.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </label>
          <label className="text-xs text-muted">Category
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All</option>
              {d.categories.map((c) => <option key={c.id} value={c.id}>{categoryPath(c.id, d.categories)}</option>)}
            </Select>
          </label>
          <label className="col-span-2 text-xs text-muted">Tag
            <Select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">All</option>
              {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </Select>
          </label>
        </div>
        <Button className="mt-4 w-full" onClick={() => { setMethod(""); setAccount(""); setCategory(""); setType(""); setTag(""); }}>Clear filters</Button>
      </Sheet>

      <BulkSheet open={bulkOpen} ids={[...selected]} onClose={() => { setBulkOpen(false); setSelected(new Set()); setSelecting(false); }} />
      <TxnDetailSheet txn={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function BulkSheet({ open, ids, onClose }: { open: boolean; ids: string[]; onClose: () => void }) {
  const d = useData();
  const [cat, setCat] = useState("");
  const [tag, setTag] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title={`Edit ${ids.length} transactions`}>
      <label className="text-xs text-muted">Set category</label>
      <div className="flex gap-2">
        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Choose…</option>
          {d.categories.map((c) => <option key={c.id} value={c.id}>{categoryPath(c.id, d.categories)}</option>)}
        </Select>
        <Button disabled={!cat} onClick={() => { bulkUpdate(ids, { category_id: cat }); onClose(); }}>Apply</Button>
      </div>
      <label className="mt-3 block text-xs text-muted">Add tag</label>
      <div className="flex gap-2">
        <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="trip" />
        <Button
          disabled={!tag}
          onClick={() => {
            const t = tag.replace(/^#/, "");
            for (const tx of d.transactions.filter((x) => ids.includes(x.id))) bulkUpdate([tx.id], { tags: [...new Set([...tx.tags, t])] });
            onClose();
          }}
        >
          Add
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={() => { bulkUpdate(ids, { exclude_from_budget: true }); onClose(); }}>Exclude from budget</Button>
        <Button onClick={() => { bulkUpdate(ids, { exclude_from_budget: false }); onClose(); }}>Include in budget</Button>
      </div>
    </Sheet>
  );
}

function CalendarView({ txns, today, onPick }: { txns: Transaction[]; today: string; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(today.slice(0, 7) + "-01");
  const m = parseDate(month);
  const first = clampedDate(m.getUTCFullYear(), m.getUTCMonth(), 1);
  const startPad = parseDate(first).getUTCDay();
  const days = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
  const byDay = new Map<string, number>();
  for (const t of txns) byDay.set(txnDate(t), (byDay.get(txnDate(t)) ?? 0) + budgetImpact(t));
  const max = Math.max(1, ...[...byDay.values()]);
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))];
  const shift = (n: number) => setMonth(toDateStr(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + n, 1))));
  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">‹</Button>
        <span className="font-medium">{m.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
        <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label="Next month">›</Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
        {["S", "M", "T", "W", "T", "F", "S"].map((x, i) => <div key={i}>{x}</div>)}
        {cells.map((day, i) =>
          day ? (
            <button
              key={day}
              onClick={() => onPick(day)}
              className={cn("flex aspect-square flex-col items-center justify-center rounded-lg text-xs", day === today && "ring-1 ring-accent")}
              style={{ background: byDay.get(day) ? `color-mix(in srgb, var(--accent) ${Math.round(((byDay.get(day) ?? 0) / max) * 60) + 8}%, transparent)` : undefined }}
              aria-label={`${fmtDate(day)}: ${formatINR(byDay.get(day) ?? 0)}`}
            >
              <span className="text-ink">{parseInt(day.slice(8))}</span>
              {byDay.get(day) ? <span className="text-[9px] text-ink/80">{formatINR(byDay.get(day)!, { compact: true, symbol: false })}</span> : null}
            </button>
          ) : (
            <div key={`p${i}`} />
          ),
        )}
      </div>
    </div>
  );
}

function MonthStat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 shadow-card">
      <p className="truncate text-[11px] text-muted">{label}</p>
      <p className={cn("mt-0.5 truncate text-[15px] font-bold tabular", tone === "good" && "text-good", tone === "bad" && "text-bad")}>
        <Amount value={value} />
      </p>
    </div>
  );
}
