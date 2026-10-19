"use client";

import { ChevronDown, ChevronUp, MapPin, Mic, Paperclip, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { computeSplit, type Participant } from "@/lib/domain/friends";
import { dateToTs, istDate } from "@/lib/domain/dates";
import { findDuplicate } from "@/lib/domain/ledger";
import { envelopes } from "@/lib/domain/budgets";
import { formatINR, groupTyping, parseAmount, round2 } from "@/lib/domain/money";
import { merchantKey, normalizeSpoken, parseQuickAdd } from "@/lib/domain/parser";
import { parseBankSms } from "@/lib/domain/sms";
import { addTransaction, autoFill, categoryByPath, categoryPath, defaultAccountFor, ensureFriends, getProfile, type SplitInput, updateTransaction } from "@/lib/store/actions";
import { useCycle, useData, usePrevCycle, useToday } from "@/lib/store/selectors";
import { uid } from "@/lib/store/store";
import { storeReceipt } from "@/lib/receipts";
import type { PayMethod, SplitMode, Transaction, TxnType } from "@/lib/types";
import { Avatar, Badge, Button, Chip, Field, Input, Segmented, Select, Toggle, cn } from "./ui";
import { useVoice } from "./useVoice";

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
  const [amount, setAmountRaw] = useState(initial ? groupTyping(String(initial.amount)) : "");
  const setAmount = (v: string) => setAmountRaw(groupTyping(v));
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
  const [showAllCats, setShowAllCats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupOk, setDupOk] = useState(false);
  const nlRef = useRef<HTMLInputElement>(null);
  const voice = useVoice((text) => applyNl(normalizeSpoken(text)));
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
    // Most-used categories first so the common ones are one tap away.
    const use = new Map<string, number>();
    const parentOf = new Map(d.categories.map((c) => [c.id, c.parent_id ?? c.id]));
    for (const t of d.transactions.slice(-400)) if (t.category_id) use.set(parentOf.get(t.category_id) ?? "", (use.get(parentOf.get(t.category_id) ?? "") ?? 0) + 1);
    return parents
      .map((p) => ({ parent: p, children: d.categories.filter((c) => c.parent_id === p.id) }))
      .sort((a, b) => (use.get(b.parent.id) ?? 0) - (use.get(a.parent.id) ?? 0));
  }, [d.categories, d.transactions, isIncome]);

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
  const cycle = useCycle();
  const prevCycle = usePrevCycle(cycle);
  const todayStr = useToday();
  const envs = useMemo(() => envelopes(d.budget_lines, d.categories, d.transactions, cycle, prevCycle, todayStr), [d.budget_lines, d.categories, d.transactions, cycle, prevCycle, todayStr]);
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
    <p className="mt-2 text-sm leading-relaxed text-muted" aria-live="polite">
      <Sparkles size={14} className="mr-1 inline align-[-2px] text-accent" aria-hidden />
      <span className="font-semibold text-ink">{formatINR(amt)}</span>
      {mode !== "transfer" && <> · {categoryPath(categoryId || null, d.categories)}</>}
      {" · "}
      {METHODS.find((m) => m.value === method)?.label}
      {account && <> · {account.name}</>}
      {mode === "split" && myShare !== undefined && <> · your share {formatINR(myShare)}</>}
      {fromSms && <> · <Badge tone="info">from SMS</Badge></>}
    </p>
  );
  const yesterday = istDate(new Date(Date.now() - 86_400_000));
  const today = istDate();
  const selParent = d.categories.find((c) => c.id === categoryId);
  const parentId = selParent?.parent_id ?? selParent?.id ?? null;
  const children = parentId ? d.categories.filter((c) => c.parent_id === parentId) : [];
  const env = envs.find((e) => e.line.category_id === categoryId) ?? envs.find((e) => e.line.category_id === parentId);
  // What this spend does to the category's envelope (editing: the old amount is already in "spent").
  const impact = mode === "split" ? myShare ?? 0 : mode === "expense" ? amt : 0;
  const envLeft = env ? env.budget - env.spent - (editing ? impact - (initial?.my_share ?? initial?.amount ?? 0) : impact) : null;
  const isCard = (id: string) => d.credit_cards.some((c) => c.account_id === id);
  const isRupay = (id: string) => d.credit_cards.some((c) => c.account_id === id && c.is_rupay_upi);
  // Accounts that make sense for the method: UPI can come from the bank or a RuPay card.
  const accountChoices = accounts.filter((a) => {
    if (a.type === "demat" || a.type === "loan") return false;
    if (mode === "income") return a.type !== "credit_card";
    if (method === "card") return isCard(a.id);
    if (method === "cash") return a.type === "cash";
    if (method === "upi") return a.type === "savings" || a.type === "wallet" || isRupay(a.id);
    if (method === "netbanking" || method === "auto_debit") return a.type === "savings" || isCard(a.id);
    return true;
  });

  return (
    <div>
      {!editing && <Segmented value={mode} options={modes} onChange={(m) => { setMode(m); if (m === "split") setSplit((s) => ({ ...s, on: true })); }} />}

      {!editing && (
        <div className="mt-3">
          <div className="relative">
            <Wand2 size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-accent" aria-hidden />
            <Input
              ref={nlRef}
              value={nl}
              onChange={(e) => applyNl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder={mode === "split" ? "1200 dinner upi split rahul amit" : mode === "income" ? "80000 salary" : "450 swiggy card · or paste a bank SMS"}
              aria-label="Quick add"
              className={cn("h-13 pl-11 text-base", voice.supported && "pr-12")}
              autoComplete="off"
              enterKeyHint="done"
            />
            {voice.supported && (
              <button
                type="button"
                onClick={() => (voice.listening ? voice.stop() : voice.start())}
                className={cn("absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl transition", voice.listening ? "animate-pulse bg-bad text-white" : "text-muted hover:bg-surface-3 hover:text-ink")}
                aria-label={voice.listening ? "Stop listening" : "Say it"}
                aria-pressed={voice.listening}
              >
                <Mic size={18} aria-hidden />
              </button>
            )}
          </div>
          {voice.listening && <p className="mt-2 text-xs font-medium text-bad">Listening… say “450 Swiggy on card” · uses your browser’s speech service</p>}
          {voice.error && <p className="mt-2 text-xs text-warn">{voice.error}</p>}
          {preview}
          {templates.length > 0 && !nl && (
            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 no-scrollbar">
              {templates.map((t) => (
                <Chip key={t.id} onClick={() => applyNl(t.text)}>
                  {t.emoji} {t.label}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Amount */}
      <label className="mt-4 flex items-center justify-center gap-1 rounded-3xl bg-surface-2 px-4 py-3">
        <span className={cn("text-3xl font-semibold", amt > 0 ? "text-ink" : "text-muted/60")}>₹</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          aria-label="Amount in rupees"
          className="display w-full min-w-0 bg-transparent text-center text-[44px] leading-tight outline-none placeholder:text-muted/40"
          style={{ maxWidth: `${Math.max(amount.length, 1) + 1.5}ch` }}
        />
      </label>

      {/* Category */}
      {mode !== "transfer" && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-muted">Category</p>
          <div className="grid grid-cols-4 gap-2">
            {(showAllCats ? catOptions : catOptions.slice(0, 7)).map(({ parent }) => {
              const on = parentId === parent.id;
              return (
                <button
                  key={parent.id}
                  type="button"
                  onClick={() => setCategoryId(on && categoryId === parent.id ? "" : parent.id)}
                  aria-pressed={on}
                  className={cn("flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-[11px] font-medium leading-tight transition active:scale-95", on ? "border-transparent text-ink" : "border-line text-muted")}
                  style={on ? { background: `color-mix(in srgb, ${parent.color} 22%, transparent)`, boxShadow: `inset 0 0 0 1.5px ${parent.color}` } : undefined}
                >
                  <span className="text-xl" aria-hidden>{parent.icon}</span>
                  <span className="line-clamp-1">{parent.name}</span>
                </button>
              );
            })}
            {catOptions.length > 7 && (
              <button type="button" onClick={() => setShowAllCats(!showAllCats)} className="flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line text-[11px] font-medium text-muted">
                <span className="text-xl" aria-hidden>{showAllCats ? "−" : "⋯"}</span>
                {showAllCats ? "Less" : "More"}
              </button>
            )}
          </div>
          {env && envLeft !== null && (mode === "expense" || mode === "split") && (
            <p className={cn("mt-2 text-xs font-medium", envLeft < 0 ? "text-bad" : envLeft < env.budget * 0.2 ? "text-warn" : "text-muted")} aria-live="polite">
              {env.category?.icon} {env.category?.name}: {amt > 0 ? "after this, " : ""}
              {envLeft >= 0 ? `${formatINR(Math.round(envLeft))} left of ${formatINR(env.budget)}` : `${formatINR(Math.round(-envLeft))} over the ${formatINR(env.budget)} budget`}
            </p>
          )}
          {children.length > 0 && (
            <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 no-scrollbar">
              {children.map((c) => (
                <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? parentId! : c.id)}>
                  {c.icon} {c.name}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {/* How & where */}
      {mode !== "transfer" && !(mode === "split" && split.payer !== ME) && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-muted">Paid with</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
            {METHODS.filter((m) => mode !== "income" || m.value !== "card").map((m) => (
              <Chip key={m.value} active={method === m.value} onClick={() => { setMethod(m.value); setAccountId(pickAccountFor(m.value, merchant || null, false)); }}>
                {m.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {mode !== "transfer" && !(mode === "split" && split.payer !== ME) && (accountChoices.length > 1 || !accountChoices.some((a) => a.id === accountId)) && (
        <div className="mt-3">
          <p className="mb-2 text-xs font-medium text-muted">
            {mode === "income" ? "Into" : "From"}
            {showRupayAsk && (rememberedAccount ? " · remembered for this merchant" : " · bank or RuPay? I'll remember per merchant")}
          </p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar" aria-label={mode === "income" ? "Into account" : "Paid from"}>
            {(accountChoices.length ? accountChoices : accounts).map((a) => (
              <Chip key={a.id} active={accountId === a.id} onClick={() => setAccountId(a.id)}>
                {a.icon} {a.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {mode === "transfer" && (
        <div className="mt-4 grid grid-cols-2 gap-x-3">
          <Field label="From account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Choose…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="To account">
            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Choose…</option>
              {accounts.filter((a) => a.id !== accountId).map((a) => (
                <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-x-3">
        <Field label={mode === "income" ? "From" : "Merchant / payee"}>
          <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={mode === "income" ? "Employer" : "Swiggy"} />
        </Field>
        <Field label="When">
          <div className="flex gap-1.5">
            <Chip active={date === today} onClick={() => setDate(today)}>Today</Chip>
            <Chip active={date === yesterday} onClick={() => setDate(yesterday)}>Yday</Chip>
          </div>
        </Field>
      </div>
      {date !== today && date !== yesterday && <p className="-mt-2 mb-2 text-xs text-muted">On {date}</p>}

      {mode === "split" && <SplitEditor split={split} setSplit={setSplit} amount={amt} shares={splitPreview.shares} err={splitPreview.err} nameOf={nameOf} />}

      <button type="button" className="mb-2 mt-1 flex min-h-11 items-center gap-1 text-sm font-medium text-accent" onClick={() => setDetails(!details)}>
        {details ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {details ? "Fewer details" : "Date, time, note, tags, receipt"}
      </button>
      {details && (
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={istDate()} />
          </Field>
          <Field label="Time">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <div className="col-span-2">
            <Field label="Note">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Tags (comma separated)">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="trip, office" />
            </Field>
          </div>
          {mode !== "transfer" && (
            <div className="col-span-2">
              <Field label="Exact category">
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
            </div>
          )}
          <div className="col-span-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm">
              <Paperclip size={15} aria-hidden /> {receipt ? "Replace receipt" : "Attach receipt"}
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
              <MapPin size={15} aria-hidden /> {location ? "Location added" : "Add location"}
            </Button>
          </div>
          <div className="col-span-2">
            <Toggle checked={exclude} onChange={setExclude} label="Exclude from budget" />
          </div>
        </div>
      )}

      {error === "dup" && dup ? (
        <div className="mt-2 rounded-2xl border border-warn/40 bg-warn/10 p-3 text-sm">
          Looks like a duplicate of {formatINR(dup.amount)} · {dup.merchant} logged {new Date(dup.occurred_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => { setDupOk(true); setError(null); }}>Save anyway</Button>
            <Button size="sm" variant="ghost" onClick={onDone}>Discard</Button>
          </div>
        </div>
      ) : (
        error && <p className="mt-2 text-sm text-bad" role="alert">{error}</p>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 mt-3 border-t border-line bg-surface px-4 pb-2 pt-3">
        <Button variant="primary" size="lg" className="w-full disabled:bg-surface-3 disabled:text-muted disabled:opacity-100 disabled:shadow-none" onClick={save} disabled={amt <= 0}>
          {editing ? "Save changes" : amt > 0 ? `Save ${formatINR(amt)}` : "Enter an amount"}
        </Button>
      </div>
      {profile.onboarded && !editing && <p className="mt-1 text-center text-[11px] text-muted">Try “paid by rahul”, “split amit neha”, “yesterday”, “#tag”, “rupay”</p>}
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
