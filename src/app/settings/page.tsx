"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Amount, Badge, Button, Card, Field, Input, PageHeader, Row, SectionTitle, Segmented, Select, Sheet, Textarea, Toggle } from "@/components/ui";
import { describeSetting, getCycle, ordinal } from "@/lib/domain/cycle";
import { istDate } from "@/lib/domain/dates";
import { formatINR, parseAmount } from "@/lib/domain/money";
import { type CsvMapping, type CsvPreviewRow, commitCsv, deleteAll, download, exportJson, guessMapping, importJson, parseCsv, previewCsv, transactionsCsv } from "@/lib/data";
import {
  categoryPath, deleteCategory, deleteRuleEngine, deleteTemplate, deleteUpiHandle, getProfile, iconFor, newAccount, reconcileAccount,
  saveAccount, saveCategory, saveRuleEngine, saveTemplate, saveUpiHandle, setCycleSetting, updateProfile,
} from "@/lib/store/actions";
import { useBalances, useData } from "@/lib/store/selectors";
import { useStore } from "@/lib/store/store";
import { biometricAvailable, hashPin, registerBiometric } from "@/lib/security";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { subscribePush } from "@/lib/push";
import type { Account, AccountType, PayMethod } from "@/lib/types";

export default function SettingsPage() {
  const d = useData();
  const p = getProfile(d);
  const email = useStore((s) => s.email);
  const syncStatus = useStore((s) => s.syncStatus);
  const [sheet, setSheet] = useState<null | "cycle" | "accounts" | "categories" | "rules" | "templates" | "pin" | "csv" | "import">(null);
  const cycle = getCycle(istDate(), p.cycle_history);
  const current = [...p.cycle_history].sort((a, b) => a.effective_from.localeCompare(b.effective_from)).filter((h) => h.effective_from <= istDate()).pop();
  const pending = p.cycle_history.find((h) => h.effective_from > istDate());

  return (
    <div>
      <PageHeader back="/more" title="Settings" />

      <SectionTitle>Profile</SectionTitle>
      <Card className="space-y-1">
        <Field label="Name"><Input defaultValue={p.name} onBlur={(e) => updateProfile({ name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monthly salary (₹)" hint="Used as expected income until salary lands"><Input inputMode="decimal" defaultValue={p.salary} onBlur={(e) => updateProfile({ salary: parseAmount(e.target.value) ?? p.salary })} /></Field>
          <Field label="My UPI ID" hint="For payment requests"><Input defaultValue={p.my_upi_id ?? ""} onBlur={(e) => updateProfile({ my_upi_id: e.target.value || null })} /></Field>
        </div>
      </Card>

      <SectionTitle>Budget</SectionTitle>
      <Card className="p-1">
        <Row onClick={() => setSheet("cycle")} left="🗓️" title="Budget month" sub={`${current ? describeSetting(current) : "Calendar month"} · now ${cycle.start} → ${cycle.end}${pending ? ` · switches ${pending.effective_from}` : ""}`} right="›" />
        <div className="grid grid-cols-2 gap-3 px-3 py-2">
          <Field label="Safety buffer (% of income)"><Input inputMode="decimal" defaultValue={p.buffer_pct} onBlur={(e) => updateProfile({ buffer_pct: parseFloat(e.target.value) || 0 })} /></Field>
          <Field label="Default account">
            <Select value={p.default_account_id ?? ""} onChange={(e) => updateProfile({ default_account_id: e.target.value || null })}>
              {d.accounts.filter((a) => a.type === "savings" || a.type === "wallet").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="STCG rate %" hint="Editable since rates change"><Input inputMode="decimal" defaultValue={p.stcg_rate} onBlur={(e) => updateProfile({ stcg_rate: parseFloat(e.target.value) || 0 })} /></Field>
          <Field label="LTCG rate %"><Input inputMode="decimal" defaultValue={p.ltcg_rate} onBlur={(e) => updateProfile({ ltcg_rate: parseFloat(e.target.value) || 0 })} /></Field>
        </div>
      </Card>

      <SectionTitle>Money setup</SectionTitle>
      <Card className="p-1">
        <Row onClick={() => setSheet("accounts")} left="🏦" title="Accounts & UPI handles" sub={`${d.accounts.filter((a) => !a.archived).length} accounts · reconcile balances`} right="›" />
        <Row href="/cards" left="💳" title="Credit cards" sub={`${d.credit_cards.length} cards`} right="›" />
        <Row onClick={() => setSheet("categories")} left="🏷️" title="Categories" sub={`${d.categories.length} categories`} right="›" />
        <Row onClick={() => setSheet("rules")} left="⚡" title="Auto-categorisation rules" sub={`${d.rules.length} rules · merchant memory ${d.merchant_memory.length}`} right="›" />
        <Row onClick={() => setSheet("templates")} left="⭐" title="Quick-add templates" sub={d.templates.map((t) => t.label).join(", ") || "None"} right="›" />
        <div className="px-3 py-2">
          <Field label="Family PANs for IPOs (comma separated)" hint="Each gets its own allotment stats and P&L">
            <Input defaultValue={p.family_pans.join(", ")} onBlur={(e) => updateProfile({ family_pans: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="Mom, Dad" />
          </Field>
        </div>
      </Card>

      <SectionTitle>Notifications</SectionTitle>
      <NotificationSettings />

      <SectionTitle>Security & privacy</SectionTitle>
      <Card className="space-y-1">
        <Row onClick={() => setSheet("pin")} left="🔢" title={p.pin_hash ? "Change app PIN" : "Set app PIN"} sub={p.pin_hash ? "PIN is on" : "Off"} right="›" />
        <BiometricRow />
        <div className="px-3">
          <Field label="Lock after idle (minutes)"><Input inputMode="numeric" defaultValue={p.lock_minutes} onBlur={(e) => updateProfile({ lock_minutes: parseInt(e.target.value) || 5 })} /></Field>
          <Toggle checked={p.privacy_mode} onChange={(v) => updateProfile({ privacy_mode: v })} label="Privacy mode (blur amounts)" />
          {p.pin_hash && <Button size="sm" className="mt-2" onClick={() => useStore.getState().set({ locked: true })}>Lock now</Button>}
        </div>
      </Card>

      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <Segmented value={p.theme} onChange={(v) => updateProfile({ theme: v })} options={[{ value: "system", label: "Auto" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} />
      </Card>

      <SectionTitle>Sync</SectionTitle>
      <Card>
        {supabaseConfigured ? (
          email ? (
            <div className="flex items-center justify-between">
              <div><p className="text-sm">Signed in as {email}</p><p className="text-xs text-muted">Status: {syncStatus}</p></div>
              <Button size="sm" onClick={() => supabase()!.auth.signOut()}>Sign out</Button>
            </div>
          ) : (
            <Link href="/login" className="text-sm text-accent">Sign in to sync across devices →</Link>
          )
        ) : (
          <p className="text-sm text-muted">Local-only mode: data lives in this browser (IndexedDB). Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to sync with Supabase.</p>
        )}
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card className="p-1">
        <Row onClick={() => download(`paisa-os-transactions-${istDate()}.csv`, transactionsCsv(), "text/csv")} left="📄" title="Export transactions (CSV)" />
        <Row onClick={() => download(`paisa-os-backup-${istDate()}.json`, exportJson(), "application/json")} left="💾" title="Full backup (JSON)" />
        <Row onClick={() => setSheet("import")} left="📥" title="Restore from JSON backup" />
        <Row onClick={() => setSheet("csv")} left="🏦" title="Import bank / card statement CSV" sub="Column mapping + duplicate check" />
        <Row href="/tax" left="🧾" title="Tax helper" sub="Rent for HRA, IPO capital gains, 80C" />
        <Row
          onClick={async () => {
            if (confirm("Delete ALL Paisa OS data on this device (and in Supabase if signed in)? This cannot be undone.")) {
              await deleteAll();
              location.href = "/onboarding";
            }
          }}
          left="🗑️"
          title={<span className="text-bad">Delete all data</span>}
        />
      </Card>
      <p className="mt-6 text-center text-xs text-muted">Paisa OS · single-user personal finance · <a className="underline" href="https://github.com/deep-9549/paisa-os" target="_blank" rel="noreferrer">source</a></p>

      <CycleSheet open={sheet === "cycle"} onClose={() => setSheet(null)} />
      <AccountsSheet open={sheet === "accounts"} onClose={() => setSheet(null)} />
      <CategoriesSheet open={sheet === "categories"} onClose={() => setSheet(null)} />
      <RulesSheet open={sheet === "rules"} onClose={() => setSheet(null)} />
      <TemplatesSheet open={sheet === "templates"} onClose={() => setSheet(null)} />
      <PinSheet open={sheet === "pin"} onClose={() => setSheet(null)} />
      <CsvSheet open={sheet === "csv"} onClose={() => setSheet(null)} />
      <ImportSheet open={sheet === "import"} onClose={() => setSheet(null)} />
    </div>
  );
}

function NotificationSettings() {
  const d = useData();
  const p = getProfile(d);
  const [perm, setPerm] = useState<string>("default");
  useEffect(() => setPerm(typeof Notification !== "undefined" ? Notification.permission : "unsupported"), []);
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm">Push notifications</p>
          <p className="text-xs text-muted">Card dues (5/2/0 days), statements, bills, budget pace, IPO events</p>
        </div>
        {perm === "granted" ? <Badge tone="good">On</Badge> : perm === "unsupported" ? <Badge>Unsupported</Badge> : (
          <Button size="sm" onClick={async () => { const r = await Notification.requestPermission(); setPerm(r); if (r === "granted") subscribePush(); }}>Enable</Button>
        )}
      </div>
      <Toggle checked={p.notify_daily_nudge} onChange={(v) => updateProfile({ notify_daily_nudge: v })} label="Daily reminders: morning brief + 9 PM close-the-day" />
      <Toggle checked={p.notify_weekly} onChange={(v) => updateProfile({ notify_weekly: v })} label="Weekly summary on Sunday" />
      <Toggle checked={p.email_digest} onChange={(v) => updateProfile({ email_digest: v })} label="Email digest (needs Supabase + Resend)" />
      <Field label="Remind me of friend balances older than (days)"><Input inputMode="numeric" defaultValue={p.friend_reminder_days} onBlur={(e) => updateProfile({ friend_reminder_days: parseInt(e.target.value) || 14 })} /></Field>
    </Card>
  );
}

function BiometricRow() {
  const d = useData();
  const p = getProfile(d);
  const [avail, setAvail] = useState(false);
  useEffect(() => { biometricAvailable().then(setAvail); }, []);
  if (!avail) return null;
  return (
    <Row
      left="👆"
      title="Device biometric unlock"
      sub={p.webauthn_credential_id ? "On" : p.pin_hash ? "Off" : "Set a PIN first"}
      onClick={async () => {
        if (!p.pin_hash) return;
        if (p.webauthn_credential_id) return updateProfile({ webauthn_credential_id: null });
        const id = await registerBiometric(p.name);
        if (id) updateProfile({ webauthn_credential_id: id });
      }}
      right={p.webauthn_credential_id ? "Turn off" : "Turn on"}
    />
  );
}

function CycleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = getProfile(useData());
  const cur = [...p.cycle_history].sort((a, b) => a.effective_from.localeCompare(b.effective_from)).pop()!;
  const [mode, setMode] = useState(cur.mode);
  const [day, setDay] = useState(cur.start_day);
  return (
    <Sheet open={open} onClose={onClose} title="Budget month">
      <Segmented value={mode} onChange={setMode} options={[{ value: "calendar", label: "Calendar" }, { value: "custom", label: "Custom day" }, { value: "salary", label: "Salary day" }]} />
      {mode !== "calendar" && (
        <div className="mt-3">
          <Field label={mode === "salary" ? "Usual salary day (fallback)" : "Cycle starts on"} hint="Days past a month's end fall back to its last day.">
            <Select value={day} onChange={(e) => setDay(+e.target.value)}>{Array.from({ length: 31 }, (_, i) => i + 1).map((x) => <option key={x} value={x}>{ordinal(x)}</option>)}</Select>
          </Field>
        </div>
      )}
      <p className="my-3 text-xs text-muted">The change starts the new cycle from the next start date and never rewrites past months. {mode === "salary" && "In salary mode the cycle starts on the day salary actually lands, so an early or late salary shifts it automatically."}</p>
      <Button variant="primary" className="w-full" onClick={() => { setCycleSetting(mode, day); onClose(); }}>Save</Button>
    </Sheet>
  );
}

function AccountsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const bal = useBalances();
  const [edit, setEdit] = useState<Account | "new" | null>(null);
  const [recon, setRecon] = useState<Account | null>(null);
  return (
    <Sheet open={open} onClose={onClose} title="Accounts" wide>
      {d.accounts.map((a) => (
        <div key={a.id} className="mb-2 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{a.icon} {a.name} {a.archived && <Badge>archived</Badge>} {a.is_default && <Badge tone="accent">default</Badge>}</p>
              <p className="text-xs text-muted">{a.type.replace("_", " ")} · {d.upi_handles.filter((u) => u.account_id === a.id).map((u) => u.handle).join(", ") || "no UPI handle"}</p>
            </div>
            <Amount value={a.type === "credit_card" || a.type === "loan" ? -(Math.max(-(bal.get(a.id) ?? 0), 0)) : bal.get(a.id) ?? 0} className="font-semibold" />
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => setEdit(a)}>Edit</Button>
            {a.type !== "demat" && <Button size="sm" onClick={() => setRecon(a)}>Reconcile</Button>}
          </div>
        </div>
      ))}
      <Button className="w-full" onClick={() => setEdit("new")}>+ Add account</Button>
      <AccountEdit acc={edit} onClose={() => setEdit(null)} />
      <ReconcileSheet acc={recon} onClose={() => setRecon(null)} />
    </Sheet>
  );
}

function AccountEdit({ acc, onClose }: { acc: Account | "new" | null; onClose: () => void }) {
  const d = useData();
  const ex = acc && acc !== "new" ? acc : null;
  const [a, setA] = useState<Account>(() => ex ?? newAccount({ name: "", type: "savings" }));
  const [bal, setBal] = useState("");
  const [upi, setUpi] = useState("");
  const [last, setLast] = useState<string | null>(null);
  const key = ex?.id ?? (acc ? "new" : null);
  if (key !== last) {
    setLast(key);
    setA(ex ?? newAccount({ name: "", type: "savings" }));
    setBal(ex ? String(ex.type === "loan" ? -ex.opening_balance : ex.opening_balance) : "");
    setUpi("");
  }
  if (!acc) return null;
  const handles = d.upi_handles.filter((u) => u.account_id === a.id);
  return (
    <Sheet open onClose={onClose} title={ex ? "Edit account" : "New account"}>
      {a.type === "credit_card" && <p className="mb-2 text-sm text-muted">Card limits and cycles are edited on the card page.</p>}
      <div className="grid grid-cols-2 gap-x-3">
        <div className="col-span-2"><Field label="Name"><Input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} /></Field></div>
        <Field label="Type">
          <Select value={a.type} disabled={!!ex} onChange={(e) => setA({ ...a, type: e.target.value as AccountType, icon: iconFor(e.target.value as AccountType) })}>
            {(["savings", "cash", "wallet", "demat", "loan"] as AccountType[]).map((t) => <option key={t} value={t}>{t}</option>)}
            {ex?.type === "credit_card" && <option value="credit_card">credit card</option>}
          </Select>
        </Field>
        <Field label={a.type === "loan" ? "Outstanding at start (₹)" : "Opening balance (₹)"}><Input inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} /></Field>
        <Field label="Balance as of"><Input type="date" value={a.opening_date} onChange={(e) => setA({ ...a, opening_date: e.target.value })} /></Field>
        <Field label="Colour"><Input type="color" value={a.color} onChange={(e) => setA({ ...a, color: e.target.value })} className="p-1" /></Field>
        <Field label="Icon"><Input value={a.icon} onChange={(e) => setA({ ...a, icon: e.target.value })} /></Field>
      </div>
      <Toggle checked={a.include_in_net_worth} onChange={(v) => setA({ ...a, include_in_net_worth: v })} label="Include in net worth" />
      <Toggle checked={a.archived} onChange={(v) => setA({ ...a, archived: v })} label="Archived" />
      {(a.type === "savings" || a.type === "wallet") && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-muted">UPI handles</p>
          {handles.map((h) => (
            <div key={h.id} className="flex items-center justify-between text-sm"><span>{h.handle}</span><button className="min-h-11 px-2 text-muted" onClick={() => deleteUpiHandle(h.id)} aria-label={`Remove ${h.handle}`}>✕</button></div>
          ))}
          <div className="flex gap-2"><Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="deep@boi" /><Button disabled={!upi || !ex} onClick={() => { saveUpiHandle(a.id, upi); setUpi(""); }}>Add</Button></div>
          {!ex && <p className="mt-1 text-[11px] text-muted">Save the account first, then add handles.</p>}
        </div>
      )}
      <Button variant="primary" className="mt-4 w-full" disabled={!a.name} onClick={() => {
        const v = parseAmount(bal || "0") ?? 0;
        saveAccount({ ...a, opening_balance: a.type === "loan" ? -v : v });
        onClose();
      }}>Save</Button>
    </Sheet>
  );
}

function ReconcileSheet({ acc, onClose }: { acc: Account | null; onClose: () => void }) {
  const bal = useBalances();
  const [actual, setActual] = useState("");
  if (!acc) return null;
  const isCard = acc.type === "credit_card" || acc.type === "loan";
  const book = isCard ? Math.max(-(bal.get(acc.id) ?? 0), 0) : bal.get(acc.id) ?? 0;
  const a = parseAmount(actual);
  const gap = a === null ? 0 : a - book;
  return (
    <Sheet open onClose={onClose} title={`Reconcile ${acc.name}`}>
      <p className="text-sm text-muted">App {isCard ? "outstanding" : "balance"}: <Amount value={book} className="text-ink" /></p>
      <div className="mt-3"><Field label={isCard ? "Actual outstanding per bank (₹)" : "Actual balance per bank (₹)"}><Input inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} autoFocus /></Field></div>
      {a !== null && <p className={`mb-3 text-sm ${Math.abs(gap) < 1 ? "text-good" : "text-warn"}`}>{Math.abs(gap) < 1 ? "Balances match ✓" : `Gap of ${formatINR(gap, { sign: true })} — likely a missed transaction.`}</p>}
      <div className="flex gap-2">
        <Link href={`/activity?`} className="flex h-11 flex-1 items-center justify-center rounded-xl border border-line bg-surface-2 text-sm" onClick={onClose}>Find missing</Link>
        <Button variant="primary" className="flex-1" disabled={a === null || Math.abs(gap) < 1} onClick={() => { reconcileAccount(acc.id, gap, isCard); onClose(); }}>Add adjustment</Button>
      </div>
    </Sheet>
  );
}

function CategoriesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏷️");
  const [parent, setParent] = useState("");
  const parents = d.categories.filter((c) => !c.parent_id);
  return (
    <Sheet open={open} onClose={onClose} title="Categories" wide>
      <div className="mb-4 grid grid-cols-[64px_1fr] gap-2">
        <Input value={icon} onChange={(e) => setIcon(e.target.value)} className="text-center" aria-label="Icon" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" />
        <Select className="col-span-2" value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">Top-level (expense)</option>
          {parents.map((p) => <option key={p.id} value={p.id}>Under {p.name}</option>)}
        </Select>
        <Button className="col-span-2" disabled={!name} onClick={() => {
          const par = parents.find((x) => x.id === parent);
          saveCategory({ name, icon, parent_id: parent || null, color: par?.color ?? "#94a3b8", kind: par?.kind ?? "expense" });
          setName("");
        }}>Add category</Button>
      </div>
      {parents.map((p) => (
        <div key={p.id} className="mb-2 rounded-xl border border-line p-2">
          <div className="flex items-center justify-between">
            <input className="flex-1 bg-transparent text-sm font-medium outline-none" defaultValue={`${p.name}`} onBlur={(e) => e.target.value && saveCategory({ ...p, name: e.target.value })} aria-label="Category name" />
            {p.kind === "income" && <Badge tone="good">income</Badge>}
            <button className="min-h-11 px-2 text-xs text-bad" onClick={() => confirm(`Delete ${p.name} and its sub-categories?`) && deleteCategory(p.id)}>Delete</button>
          </div>
          <div className="flex flex-wrap gap-1">
            {d.categories.filter((c) => c.parent_id === p.id).map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-xs">
                {c.icon} {c.name}
                <button onClick={() => deleteCategory(c.id)} aria-label={`Delete ${c.name}`} className="text-muted">✕</button>
              </span>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

function RulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const [match, setMatch] = useState("");
  const [cat, setCat] = useState("");
  const [method, setMethod] = useState("");
  const [acc, setAcc] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="Rules engine" wide>
      <p className="mb-3 text-sm text-muted">If merchant contains <b>UBER</b> → Transport › Cab. Rules win over merchant memory.</p>
      <div className="grid grid-cols-2 gap-2">
        <Input className="col-span-2" value={match} onChange={(e) => setMatch(e.target.value)} placeholder="Merchant contains…" />
        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Category…</option>
          {d.categories.map((c) => <option key={c.id} value={c.id}>{categoryPath(c.id, d.categories)}</option>)}
        </Select>
        <Select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">Any method</option>
          {["upi", "card", "cash", "netbanking", "auto_debit"].map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Select className="col-span-2" value={acc} onChange={(e) => setAcc(e.target.value)}>
          <option value="">Any account</option>
          {d.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Button className="col-span-2" disabled={!match} onClick={() => { saveRuleEngine(match, cat || null, (method || null) as PayMethod | null, acc || null); setMatch(""); }}>Add rule</Button>
      </div>
      <div className="mt-4 space-y-1">
        {d.rules.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span>“{r.match}” → {categoryPath(r.category_id, d.categories)}{r.method && ` · ${r.method}`}{r.account_id && ` · ${d.accounts.find((a) => a.id === r.account_id)?.name}`}</span>
            <button className="min-h-11 px-2 text-muted" onClick={() => deleteRuleEngine(r.id)} aria-label="Delete rule">✕</button>
          </div>
        ))}
      </div>
      {d.merchant_memory.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="min-h-11 cursor-pointer text-muted">Merchant memory ({d.merchant_memory.length})</summary>
          {[...d.merchant_memory].sort((a, b) => b.uses - a.uses).slice(0, 50).map((m) => (
            <p key={m.id} className="text-xs text-muted">{m.merchant} → {categoryPath(m.category_id, d.categories)} · {m.method} · {d.accounts.find((a) => a.id === m.account_id)?.name ?? "—"} ({m.uses}×)</p>
          ))}
        </details>
      )}
    </Sheet>
  );
}

function TemplatesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState("⭐");
  return (
    <Sheet open={open} onClose={onClose} title="Quick-add templates">
      <div className="grid grid-cols-[64px_1fr] gap-2">
        <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="text-center" aria-label="Emoji" />
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (Metro)" />
        <Input className="col-span-2" value={text} onChange={(e) => setText(e.target.value)} placeholder="Quick-add text: 40 metro upi" />
        <Button className="col-span-2" disabled={!label || !text} onClick={() => { saveTemplate(label, text, emoji); setLabel(""); setText(""); }}>Add template</Button>
      </div>
      <div className="mt-3 space-y-1">
        {d.templates.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span>{t.emoji} {t.label} <span className="text-muted">· {t.text}</span></span>
            <button className="min-h-11 px-2 text-muted" onClick={() => deleteTemplate(t.id)} aria-label={`Delete ${t.label}`}>✕</button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function PinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = getProfile(useData());
  const [pin, setPin] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="App PIN">
      <Field label="New 4-digit PIN"><Input inputMode="numeric" type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoFocus /></Field>
      <div className="flex gap-2">
        {p.pin_hash && <Button variant="danger" onClick={() => { updateProfile({ pin_hash: null, webauthn_credential_id: null }); onClose(); }}>Turn off</Button>}
        <Button variant="primary" className="flex-1" disabled={pin.length !== 4} onClick={async () => { updateProfile({ pin_hash: await hashPin(pin, p.id) }); setPin(""); onClose(); }}>Save PIN</Button>
      </div>
    </Sheet>
  );
}

function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet open={open} onClose={onClose} title="Restore backup">
      <p className="mb-3 text-sm text-muted">Replaces all data on this device with the backup file.</p>
      <input type="file" accept="application/json,.json" onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try { importJson(await f.text()); onClose(); } catch (x) { setErr((x as Error).message); }
      }} />
      {err && <p className="mt-2 text-sm text-bad">{err}</p>}
    </Sheet>
  );
}

function CsvSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const [text, setText] = useState("");
  const [acc, setAcc] = useState(d.accounts[0]?.id ?? "");
  const [skipDup, setSkipDup] = useState(true);
  const rows = useMemo(() => (text ? parseCsv(text) : []), [text]);
  const header = rows[0] ?? [];
  const [map, setMap] = useState<CsvMapping | null>(null);
  const m = map ?? (header.length ? guessMapping(header) : null);
  const preview: CsvPreviewRow[] = useMemo(() => (m && rows.length > 1 ? previewCsv(rows.slice(1), m, acc) : []), [m, rows, acc]);
  const colSelect = (k: keyof CsvMapping, label: string, allowNone = false) => (
    <Field label={label}>
      <Select value={String(m?.[k] ?? 0)} onChange={(e) => setMap({ ...m!, [k]: +e.target.value })}>
        {allowNone && <option value="-1">— (single amount column)</option>}
        {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </Select>
    </Field>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Import statement CSV" wide>
      <Field label="Into account">
        <Select value={acc} onChange={(e) => setAcc(e.target.value)}>{d.accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
      </Field>
      <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setMap(null); } }} />
      <Textarea className="mt-2" rows={3} value={text} onChange={(e) => { setText(e.target.value); setMap(null); }} placeholder="…or paste CSV here" />
      {m && header.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-x-3">
          {colSelect("date", "Date column")}
          {colSelect("description", "Description column")}
          {colSelect("debit", m.credit >= 0 ? "Debit column" : "Amount column (− = debit)")}
          {colSelect("credit", "Credit column", true)}
          <Field label="Date format">
            <Select value={m.dateFormat} onChange={(e) => setMap({ ...m, dateFormat: e.target.value as CsvMapping["dateFormat"] })}>
              <option value="dmy">DD/MM/YYYY</option>
              <option value="mdy">MM/DD/YYYY</option>
              <option value="ymd">YYYY-MM-DD</option>
            </Select>
          </Field>
        </div>
      )}
      {preview.length > 0 && (
        <>
          <p className="text-sm">{preview.length} rows · {preview.filter((r) => r.duplicate).length} look like duplicates</p>
          <Toggle checked={skipDup} onChange={setSkipDup} label="Skip duplicates" />
          <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
            {preview.slice(0, 100).map((r, i) => (
              <div key={i} className={`flex gap-2 px-2 py-1 text-xs ${r.duplicate ? "opacity-50" : ""}`}>
                <span className="w-20 shrink-0">{r.date}</span>
                <span className="flex-1 truncate">{r.description}</span>
                <span className={r.direction === "credit" ? "text-good" : ""}>{r.direction === "credit" ? "+" : "−"}{formatINR(r.amount, { decimals: true })}</span>
              </div>
            ))}
          </div>
          <Button variant="primary" className="mt-3 w-full" onClick={() => { const n = commitCsv(preview, acc, skipDup); useStore.getState().toast({ text: `Imported ${n} transactions` }); onClose(); setText(""); }}>
            Import
          </Button>
        </>
      )}
    </Sheet>
  );
}
