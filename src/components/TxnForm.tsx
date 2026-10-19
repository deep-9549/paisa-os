"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeSplit, type Participant } from "@/lib/domain/friends";
import { dateToTs, istDate } from "@/lib/domain/dates";
import { findDuplicate } from "@/lib/domain/ledger";
import { formatINR, parseAmount, round2 } from "@/lib/domain/money";
import { merchantKey, parseQuickAdd } from "@/lib/domain/parser";
import { parseBankSms } from "@/lib/domain/sms";
import { addTransaction, autoFill, categoryByPath, categoryPath, defaultAccountFor, ensureFriends, getProfile, type SplitInput, updateTransaction } from "@/lib/store/actions";
import { useData } from "@/lib/store/selectors";
import { uid } from "@/lib/store/store";
import { storeReceipt } from "@/lib/receipts";
import type { PayMethod, SplitMode, Transaction, TxnType } from "@/lib/types";
import { Avatar, Badge, Button, Chip, Field, Input, Segmented, Select, Toggle, cn } from "./ui";

export type FormMode = "expense" | "income" | "transfer" | "split";

const METHODS: { value: PayMethod; label: string }[] = [
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "netbanking", label: "Netbanking" },
  { value: "auto_debit", label: "Auto-debit" },
  { value: "other", label: "Other" },
];

const ME = "me";

interface SplitState {
  on: boolean;
  people: string[]; // friend ids or "new:Name"; ME = me
  payer: string; // ME | friend id | "multiple"
  payers: Record<string, string>;
  mode: SplitMode;
  values: Record<string, string>;
  groupId: string | null;
}

const emptySplit = (): SplitState => ({ on: false, people: [ME], payer: ME, payers: {}, mode: "equal", values: {}, groupId: null });

export function TxnForm({ initial, mode: initialMode = "expense", presetText, onDone, autoFocusNl = true }: { initial?: Transaction; mode?: FormMode; presetText?: string; onDone: () => void; autoFocusNl?: boolean }) {
  const d = useData();
  const profile = getProfile(d);
  const editing = !!initial;
  const accounts = d.accounts.filter((a) => !a.archived);
  const rupayCard = d.credit_cards.find((c) => c.is_rupay_upi && accounts.some((a) => a.id === c.account_id));

  const [mode, setMode] = useState<FormMode>(initial ? (initial.type === "transfer" ? "transfer" : initial.type === "income" ? "income" : initial.my_share !== null || initial.paid_by_friend_id ? "split" : "expense") : initialMode);
  const [nl, setNl] = useState(presetText ?? "");
  const [fromSms, setFromSms] = useState(false);
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [date, setDate] = useState(initial ? istDate(initial.occurred_at) : istDate());
  const [time, setTime] = useState(() => {
    const d0 = initial ? new Date(initial.occurred_at) : new Date();
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(d0);
  });
  const [method, setMethod] = useState<PayMethod>(initial?.method ?? "upi");
  const [accountId, setAccountId] = useState<string>(initial?.account_id ?? defaultAccountFor("upi", d)?.id ?? "");
  const [toAccountId, setToAccountId] = useState<string>(initial?.to_account_id ?? "");
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? "");
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [exclude, setExclude] = useState(initial?.exclude_from_budget ?? false);
  const [receipt, setReceipt] = useState<string | null>(initial?.receipt_path ?? null);
  const [location, setLocation] = useState<string | null>(initial?.location ?? null);
  const [split, setSplit] = useState<SplitState>(() => (initial ? splitFromTxn(initial, d.transaction_splits) : { ...emptySplit(), on: initialMode === "split" }));
  const [details, setDetails] = useState(editing);
  const [error, setError] = useState<string | null>(null);
  const [dupOk, setDupOk] = useState(false);
  const nlRef = useRef<HTMLInputElement>(null);
  const txnId = useRef(initial?.id ?? uid());

  useEffect(() => {
    if (autoFocusNl && !editing) nlRef.current?.focus();
  }, [autoFocusNl, editing]);

  useEffect(() => {
    if (presetText) applyNl(presetText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetText]);

  const isIncome = mode === "income";
  const catOptions = useMemo(() => {
    const kind = isIncome ? "income" : "expense";
    const parents = d.categories.filter((c) => !c.parent_id && c.kind === kind);
    return parents.map((p) => ({ parent: p, children: d.categories.filter((c) => c.parent_id === p.id) }));
  }, [d.categories, isIncome]);

  function pickAccountFor(m: PayMethod, merch: string | null, forceCard: boolean) {
    const mem = merch ? autoFill(merch, d) : null;
    if (m === "card" || forceCard) {
      const memCard = mem?.account_id && d.credit_cards.some((c) => c.account_id === mem.account_id) ? mem.account_id : null;
      return memCard ?? defaultAccountFor("card", d)?.id ?? "";
    }
    if (mem?.account_id && accounts.some((a) => a.id === mem.account_id)) {
      // RuPay-on-UPI: remembered per merchant (bank or the RuPay card).
      const acc = accounts.find((a) => a.id === mem.account_id)!;
      if (m === "upi" || acc.type !== "credit_card") return acc.id;
    }
    return defaultAccountFor(m, d)?.id ?? "";
  }

  function applyNl(text: string) {
    setNl(text);
    if (looksLikeSms(text)) {
      const s = parseBankSms(text);
      if (s) {
        setFromSms(true);
        setAmount(String(s.amount));
        setMode(s.direction === "credit" ? "income" : "expense");
        setMethod(s.method);
        if (s.merchant) setMerchant(s.merchant);
        if (s.date) setDate(s.date);
        const byDigits = s.last4 ? (s.isCard ? d.credit_cards.find((c) => c.last4 === s.last4)?.account_id : undefined) : undefined;
        setAccountId(byDigits ?? pickAccountFor(s.method, s.merchant, s.isCard));
        const mem = s.merchant ? autoFill(s.merchant, d) : null;
        const cat = mem?.category_id ?? categoryByPath(parseQuickAdd(s.merchant ?? "").categoryPath, d.categories)?.id;
        if (cat) setCategoryId(cat);
        setDetails(true);
        return;
      }
    }
    setFromSms(false);
    const p = parseQuickAdd(text, {
      friendNames: d.friends.filter((f) => !f.archived).map((f) => f.name),
      memoryCategory: (m) => {
        const mem = d.merchant_memory.find((x) => x.id === merchantKey(m));
        return mem?.category_id ? categoryPath(mem.category_id, d.categories) : null;
      },
    });
    if (p.amount !== null) setAmount(String(p.amount));
    if (p.type === "income") setMode("income");
    else if (p.splitWith.length) setMode("split");
    setMerchant(p.merchant ?? "");
    const mem = p.merchant ? autoFill(p.merchant, d) : null;
    const m: PayMethod = p.method ?? (mem?.method as PayMethod | null) ?? "upi";
    setMethod(p.forceCard && p.method === "card" ? "card" : m);
    setAccountId(pickAccountFor(m, p.merchant, p.forceCard));
    const cat = mem?.category_id ?? categoryByPath(p.categoryPath, d.categories)?.id ?? "";
    setCategoryId(cat);
    if (p.tags.length) setTags(p.tags.join(", "));
    if (p.note) setNote(p.note);
    setDate(istDate(new Date(Date.now() - p.daysAgo * 86_400_000)));
    if (p.splitWith.length) {
      const ids = p.splitWith.map((n) => d.friends.find((f) => f.name === n)?.id ?? `new:${n}`);
      const payer = p.paidBy ? (d.friends.find((f) => f.name === p.paidBy)?.id ?? `new:${p.paidBy}`) : ME;
      setSplit((s) => ({ ...s, on: true, people: [ME, ...ids.filter((x, i) => ids.indexOf(x) === i)], payer }));
    } else if (split.on && mode !== "split") setSplit(emptySplit());
  }

  const amt = parseAmount(amount) ?? 0;
  const account = accounts.find((a) => a.id === accountId);
  const nameOf = (id: string) => (id === ME ? "Me" : id.startsWith("new:") ? id.slice(4) : d.friends.find((f) => f.id === id)?.name ?? "?");

  // Live split preview
  const splitPreview = useMemo(() => {
    if (mode !== "split" || !split.on || amt <= 0 || split.people.length < 1) return { shares: null as null | { id: string; share: number }[], err: null as string | null };
    try {
      const parts: Participant[] = split.people.map((id) => ({ friend_id: id === ME ? null : id, value: parseAmount(split.values[id] ?? "") ?? (split.mode === "shares" ? 1 : 0) }));
      const payer = split.payer === "multiple" ? null : split.payer === ME ? null : split.payer;
      const shares = computeSplit(amt, split.mode, parts, payer);
      return { shares: shares.map((s, i) => ({ id: split.people[i], share: s.share })), err: null };
    } catch (e) {
      return { shares: null, err: (e as Error).message };
    }
  }, [mode, split, amt]);

  const myShare = splitPreview.shares?.find((s) => s.id === ME)?.share;
  const dup = !editing && amt > 0 && merchant ? findDuplicate({ id: txnId.current, amount: amt, merchant, occurred_at: dateToTs(date, time) }, d.transactions) : undefined;

  const showRupayAsk = !!rupayCard && mode !== "transfer" && mode !== "income" && method === "upi" && !(split.on && split.payer !== ME);
  const rememberedAccount = merchant ? d.merchant_memory.find((m) => m.id === merchantKey(merchant))?.account_id : null;

  async function save() {
    setError(null);
    if (amt <= 0) return setError("Enter an amount");
    if (dup && !dupOk) return setError("dup");
    const type: TxnType = mode === "income" ? "income" : mode === "transfer" ? "transfer" : initial?.type === "refund" ? "refund" : "expense";
    if (type === "transfer" && (!accountId || !toAccountId || accountId === toAccountId)) return setError("Pick two different accounts");
    const paidByFriend = mode === "split" && split.on && split.payer !== ME && split.payer !== "multiple";
    if (!paidByFriend && !accountId && !(mode === "split" && split.payer === "multiple")) return setError("Pick an account");

    let splitInput: SplitInput | null = null;
    if (mode === "split" && split.on) {
      if (splitPreview.err) return setError(splitPreview.err);
      if (split.people.length < 2) return setError("Add at least one friend to split with");
      const newNames = [...split.people, split.payer, ...Object.keys(split.payers)].filter((x) => x.startsWith("new:")).map((x) => x.slice(4));
      const created = ensureFriends([...new Set(newNames)]);
      const resolve = (id: string) => (id === ME ? null : id.startsWith("new:") ? created.find((f) => f.name.toLowerCase() === id.slice(4).toLowerCase())?.id ?? null : id);
      let payers: { friend_id: string | null; amount: number }[] | undefined;
      if (split.payer === "multiple") {
        payers = Object.entries(split.payers)
          .map(([id, v]) => ({ friend_id: resolve(id), amount: parseAmount(v) ?? 0 }))
          .filter((p) => p.amount > 0);
        const tot = round2(payers.reduce((a, p) => a + p.amount, 0));
        if (tot !== amt) return setError(`Payers add up to ${formatINR(tot)}, bill is ${formatINR(amt)}`);
      }
      splitInput = {
        mode: split.mode,
        participants: split.people.map((id) => ({ friend_id: resolve(id), value: parseAmount(split.values[id] ?? "") ?? (split.mode === "shares" ? 1 : 0) })),
        payerFriendId: split.payer === ME || split.payer === "multiple" ? null : resolve(split.payer),
        payers,
        groupId: split.groupId,
      };
    }

    const fields: Partial<Transaction> = {
      type,
      amount: amt,
      occurred_at: dateToTs(date, time),
      account_id: paidByFriend ? null : accountId || null,
      to_account_id: type === "transfer" ? toAccountId : null,
      method: type === "transfer" ? (method === "card" ? "netbanking" : method) : method,
      category_id: type === "transfer" ? categoryId || null : categoryId || null,
      merchant: merchant.trim() || null,
      note: note.trim() || null,
      tags: tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
      exclude_from_budget: exclude,
      receipt_path: receipt,
      location,
    };

    if (editing && initial) {
      updateTransaction(initial, fields, mode === "split" ? splitInput : initial.my_share !== null || initial.paid_by_friend_id ? null : undefined);
    } else {
      addTransaction({ id: txnId.current, ...fields, amount: amt, split: splitInput });
    }
    onDone();
  }

  const modes: { value: FormMode; label: string }[] = [
    { value: "expense", label: "Expense" },
    { value: "income", label: "Income" },
    { value: "transfer", label: "Transfer" },
    { value: "split", label: "Split" },
  ];

  const templates = d.templates;
  const preview = amt > 0 && (
    <p className="mt-2 text-sm text-muted" aria-live="polite">
      <span className="font-semibold text-ink">{formatINR(amt)}</span>
      {mode !== "transfer" && <> · {categoryPath(categoryId || null, d.categories)}</>}
      {" · "}
      {METHODS.find((m) => m.value === method)?.label}
      {account && <> · {account.name}</>}
      {mode === "split" && myShare !== undefined && <> · your share {formatINR(myShare)}</>}
      {fromSms && <> · <Badge tone="info">from SMS</Badge></>}
    </p>
  );

  return (
    <div>
      {!editing && <Segmented value={mode} options={modes} onChange={(m) => { setMode(m); if (m === "split") setSplit((s) => ({ ...s, on: true })); }} />}

      {!editing && (
        <div className="mt-3">
          <Input
            ref={nlRef}
            value={nl}
            onChange={(e) => applyNl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder={mode === "split" ? "1200 dinner upi split rahul amit" : mode === "income" ? "80000 salary" : "450 swiggy card · or paste a bank SMS"}
            aria-label="Quick add"
            className="h-12 text-base"
            autoComplete="off"
          />
          {preview}
          {templates.length > 0 && !nl && (
            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
              {templates.map((t) => (
                <Chip key={t.id} onClick={() => applyNl(t.text)}>
                  {t.emoji} {t.label}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {showRupayAsk && (
        <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3">
          <p className="mb-2 text-xs text-muted">{rememberedAccount ? "Paid from (remembered for this merchant)" : "Bank or RuPay? I'll remember for this merchant."}</p>
          <Segmented
            size="sm"
            value={accountId === rupayCard!.account_id ? "card" : "bank"}
            options={[{ value: "bank", label: defaultAccountFor("upi", d)?.name ?? "Bank" }, { value: "card", label: accounts.find((a) => a.id === rupayCard!.account_id)?.name ?? "RuPay card" }]}
            onChange={(v) => setAccountId(v === "card" ? rupayCard!.account_id : defaultAccountFor("upi", d)?.id ?? "")}
          />
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-x-3">
        <Field label="Amount (₹)">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" aria-label="Amount in rupees" />
        </Field>
        {mode !== "transfer" ? (
          <Field label="Category">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category">
              <option value="">Uncategorised</option>
              {catOptions.map(({ parent, children }) => (
                <optgroup key={parent.id} label={`${parent.icon} ${parent.name}`}>
                  <option value={parent.id}>{parent.name}</option>
                  {children.map((c) => (
                    <option key={c.id} value={c.id}>
                      {parent.name} › {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="To account">
            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Choose…</option>
              {accounts.filter((a) => a.id !== accountId).map((a) => (
                <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
              ))}
            </Select>
          </Field>
        )}
        {!(mode === "split" && split.payer !== ME) && (
          <Field label={mode === "transfer" ? "From account" : mode === "income" ? "Into account" : "Paid from"}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Choose…</option>
              {accounts.filter((a) => mode !== "income" || a.type !== "credit_card").map((a) => (
                <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Method">
          <Select
            value={method}
            onChange={(e) => {
              const m = e.target.value as PayMethod;
              setMethod(m);
              if (mode !== "transfer") setAccountId(pickAccountFor(m, merchant || null, false));
            }}
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Merchant / payee">
          <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Swiggy" />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={istDate()} />
        </Field>
      </div>

      {mode === "split" && <SplitEditor split={split} setSplit={setSplit} amount={amt} shares={splitPreview.shares} err={splitPreview.err} nameOf={nameOf} />}

      <button type="button" className="mb-2 mt-1 min-h-11 text-sm text-accent" onClick={() => setDetails(!details)}>
        {details ? "− Fewer details" : "+ More details (note, tags, receipt…)"}
      </button>
      {details && (
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Time">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Tags (comma separated)">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="trip, office" />
          </Field>
          <div className="col-span-2">
            <Field label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <div className="col-span-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm">
              📎 {receipt ? "Replace receipt" : "Attach receipt"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setReceipt(await storeReceipt(f, txnId.current));
                }}
              />
            </label>
            {receipt && <Badge tone="good">Receipt attached</Badge>}
            <Button
              size="sm"
              type="button"
              onClick={() =>
                navigator.geolocation?.getCurrentPosition((pos) => setLocation(`${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`))
              }
            >
              📍 {location ? "Location added" : "Add location"}
            </Button>
          </div>
          <div className="col-span-2">
            <Toggle checked={exclude} onChange={setExclude} label="Exclude from budget" />
          </div>
        </div>
      )}

      {error === "dup" && dup ? (
        <div className="mt-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
          Looks like a duplicate of {formatINR(dup.amount)} · {dup.merchant} logged {new Date(dup.occurred_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => { setDupOk(true); setError(null); }}>Save anyway</Button>
            <Button size="sm" variant="ghost" onClick={onDone}>Discard</Button>
          </div>
        </div>
      ) : (
        error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>
      )}

      <Button variant="primary" size="lg" className="mt-4 w-full" onClick={save} disabled={amt <= 0}>
        {editing ? "Save changes" : `Save${amt > 0 ? ` ${formatINR(amt)}` : ""}`}
      </Button>
      {profile.onboarded && !editing && <p className="mt-2 text-center text-[11px] text-muted">Tip: “paid by rahul”, “split amit neha”, “yesterday”, “#tag”, “rupay”</p>}
    </div>
  );
}

function SplitEditor({ split, setSplit, amount, shares, err, nameOf }: { split: SplitState; setSplit: (f: (s: SplitState) => SplitState) => void; amount: number; shares: { id: string; share: number }[] | null; err: string | null; nameOf: (id: string) => string }) {
  const d = useData();
  const friends = d.friends.filter((f) => !f.archived);
  const groups = d.friend_groups;
  const [newName, setNewName] = useState("");
  const toggle = (id: string) =>
    setSplit((s) => ({ ...s, people: s.people.includes(id) ? s.people.filter((x) => x !== id) : [...s.people, id] }));
  const unit = split.mode === "percent" ? "%" : split.mode === "shares" ? "×" : "₹";

  return (
    <div className="mb-3 rounded-2xl border border-line bg-surface-2 p-3">
      {groups.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {groups.map((g) => (
            <Chip
              key={g.id}
              active={split.groupId === g.id}
              onClick={() => {
                const members = d.group_members.filter((m) => m.group_id === g.id).map((m) => m.friend_id);
                setSplit((s) => ({ ...s, groupId: s.groupId === g.id ? null : g.id, people: s.groupId === g.id ? [ME] : [ME, ...members] }));
              }}
            >
              {g.emoji} {g.name}
            </Chip>
          ))}
        </div>
      )}
      <p className="mb-2 text-xs text-muted">Split between</p>
      <div className="flex flex-wrap gap-2">
        <Chip active={split.people.includes(ME)} onClick={() => toggle(ME)}>Me</Chip>
        {friends.map((f) => (
          <Chip key={f.id} active={split.people.includes(f.id)} onClick={() => toggle(f.id)} color={f.color}>
            {f.name}
          </Chip>
        ))}
        {split.people.filter((p) => p.startsWith("new:")).map((p) => (
          <Chip key={p} active onClick={() => toggle(p)}>
            {p.slice(4)} <Badge tone="accent">new</Badge>
          </Chip>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) toggle(`new:${newName.trim()}`);
            setNewName("");
          }}
        >
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="+ Add person" className="h-9 w-28 rounded-full border border-dashed border-line bg-transparent px-3 text-sm outline-none" />
        </form>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Paid by">
          <Select value={split.payer} onChange={(e) => setSplit((s) => ({ ...s, payer: e.target.value }))}>
            {split.people.map((id) => (
              <option key={id} value={id}>{nameOf(id)}</option>
            ))}
            <option value="multiple">Several people</option>
          </Select>
        </Field>
        <Field label="How to split">
          <Select value={split.mode} onChange={(e) => setSplit((s) => ({ ...s, mode: e.target.value as SplitMode, values: {} }))}>
            <option value="equal">Equally</option>
            <option value="exact">Exact amounts</option>
            <option value="percent">Percentages</option>
            <option value="shares">Shares</option>
            <option value="itemised">Itemised (per dish)</option>
          </Select>
        </Field>
      </div>

      {split.payer === "multiple" && (
        <div className="mb-2">
          <p className="mb-1 text-xs text-muted">Who paid how much</p>
          {split.people.map((id) => (
            <div key={id} className="mb-1 flex items-center gap-2">
              <span className="w-24 truncate text-sm">{nameOf(id)}</span>
              <Input inputMode="decimal" className="h-9" placeholder="0" value={split.payers[id] ?? ""} onChange={(e) => setSplit((s) => ({ ...s, payers: { ...s.payers, [id]: e.target.value } }))} />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {split.people.map((id) => {
          const sh = shares?.find((s) => s.id === id)?.share;
          return (
            <div key={id} className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm">{nameOf(id)}</span>
              {split.mode !== "equal" && (
                <div className="relative w-28">
                  <Input inputMode="decimal" className="h-9 pr-7" placeholder={split.mode === "shares" ? "1" : "0"} value={split.values[id] ?? ""} onChange={(e) => setSplit((s) => ({ ...s, values: { ...s.values, [id]: e.target.value } }))} aria-label={`${nameOf(id)} ${split.mode}`} />
                  <span className="absolute right-2 top-2 text-xs text-muted">{unit}</span>
                </div>
              )}
              <span className={cn("w-20 text-right text-sm tabular", id === ME && "font-semibold")}>{sh !== undefined ? formatINR(sh, { decimals: sh % 1 !== 0 }) : "—"}</span>
            </div>
          );
        })}
      </div>
      {split.mode === "itemised" && <p className="mt-1 text-xs text-muted">Enter each person&apos;s items; tax/tip is shared in proportion.</p>}
      {err && amount > 0 && <p className="mt-2 text-xs text-bad">{err}</p>}
    </div>
  );
}

function looksLikeSms(t: string) {
  return t.length > 35 && /(rs\.?|inr|₹)\s*[\d,]+/i.test(t) && /(debited|credited|spent|withdrawn|a\/c|card)/i.test(t);
}

function splitFromTxn(t: Transaction, splits: { transaction_id: string; friend_id: string | null; share: number }[]): SplitState {
  const rows = splits.filter((s) => s.transaction_id === t.id);
  if (!rows.length) return emptySplit();
  const people = rows.map((r) => r.friend_id ?? ME);
  const payer = t.payers?.length ? "multiple" : t.paid_by_friend_id ?? ME;
  const payers: Record<string, string> = {};
  t.payers?.forEach((p) => (payers[p.friend_id ?? ME] = String(p.amount)));
  const mode = t.split_mode === "equal" || !t.split_mode ? "equal" : "exact";
  const values: Record<string, string> = {};
  if (mode === "exact") rows.forEach((r) => (values[r.friend_id ?? ME] = String(r.share)));
  return { on: true, people, payer, payers, mode, values, groupId: t.group_id };
}

export { Avatar };
