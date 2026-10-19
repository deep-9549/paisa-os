"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Amount, Avatar, Badge, Button, Card, Chip, Empty, Field, Input, PageHeader, Row, SectionTitle, Segmented, Select, Sheet } from "@/components/ui";
import { diffDays, fmtDate, istDate } from "@/lib/domain/dates";
import { balanceSince, groupNets, simplifyDebts } from "@/lib/domain/friends";
import { isLive } from "@/lib/domain/ledger";
import { formatINR, parseAmount } from "@/lib/domain/money";
import { addTransaction, categoryByPath, defaultAccountFor, deleteGroup, saveGroup } from "@/lib/store/actions";
import { useData, useFriendBalances, useToday } from "@/lib/store/selectors";
import { FriendSheet } from "@/components/FriendSheet";

export default function FriendsPage() {
  const d = useData();
  const today = useToday();
  const bal = useFriendBalances();
  const [tab, setTab] = useState<"people" | "groups" | "stats">("people");
  const [addFriend, setAddFriend] = useState(false);
  const [groupEdit, setGroupEdit] = useState<string | "new" | null>(null);
  const [outing, setOuting] = useState(false);
  const friends = d.friends.filter((f) => !f.archived);
  const owed = [...bal.values()].filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const owe = [...bal.values()].filter((v) => v < 0).reduce((a, b) => a - b, 0);

  return (
    <div>
      <PageHeader back="/more" title="Friends" subtitle="Friends never log in — they're contacts in your ledger" action={<Button size="sm" onClick={() => setAddFriend(true)}>+ Friend</Button>} />
      <div className="grid grid-cols-2 gap-2">
        <Card><p className="text-xs text-muted">Owed to you</p><p className="text-xl font-bold text-good"><Amount value={owed} /></p></Card>
        <Card><p className="text-xs text-muted">You owe</p><p className="text-xl font-bold text-bad"><Amount value={owe} /></p></Card>
      </div>
      <Button variant="primary" className="mt-3 w-full" onClick={() => setOuting(true)}>🌙 Start an outing</Button>
      <div className="mt-4"><Segmented value={tab} onChange={setTab} options={[{ value: "people", label: "People" }, { value: "groups", label: "Groups" }, { value: "stats", label: "Stats" }]} /></div>

      {tab === "people" && (
        <Card className="mt-3 p-1">
          {friends.length === 0 && <Empty icon="👥" title="No friends yet" body="Add friends here or just type “split rahul amit” in quick-add." />}
          {friends
            .map((f) => ({ f, v: bal.get(f.id) ?? 0, since: balanceSince(f.id, d.transactions, d.transaction_splits, d.settlements) }))
            .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
            .map(({ f, v, since }) => (
              <Row
                key={f.id}
                href={`/friends/${f.id}`}
                left={<Avatar name={f.name} color={f.color} />}
                title={f.name}
                sub={v === 0 ? "settled up" : `${v > 0 ? "owes you" : "you owe"}${since ? ` · since ${fmtDate(since)}` : ""}`}
                right={
                  <div>
                    <Amount value={Math.abs(v)} className={`font-semibold ${v > 0 ? "text-good" : v < 0 ? "text-bad" : "text-muted"}`} />
                    {since && diffDays(today, since) >= (d.profiles[0]?.friend_reminder_days ?? 14) && <div><Badge tone="warn">{diffDays(today, since)}d old</Badge></div>}
                  </div>
                }
              />
            ))}
        </Card>
      )}

      {tab === "groups" && (
        <div className="mt-3 space-y-3">
          {d.friend_groups.length === 0 && <Empty icon="🍻" title="No groups" body="Groups like “Weekend Gang” make splitting one tap." action={<Button onClick={() => setGroupEdit("new")}>Create group</Button>} />}
          {d.friend_groups.map((g) => {
            const nets = groupNets(d.transactions, d.transaction_splits, g.id);
            const transfers = simplifyDebts(nets);
            const name = (k: string) => (k === "me" ? "You" : d.friends.find((f) => f.id === k)?.name ?? "?");
            const members = d.group_members.filter((m) => m.group_id === g.id);
            return (
              <Card key={g.id}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{g.emoji} {g.name}</p>
                  <button className="min-h-11 px-2 text-sm text-muted" onClick={() => setGroupEdit(g.id)}>Edit</button>
                </div>
                <div className="mt-1 flex -space-x-2">
                  {members.map((m) => { const f = d.friends.find((x) => x.id === m.friend_id); return f ? <Avatar key={m.id} name={f.name} color={f.color} size={28} /> : null; })}
                </div>
                <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-muted">Simplified settle-up</p>
                {transfers.length === 0 ? <p className="text-sm text-muted">All square 🎉</p> : transfers.map((t, i) => (
                  <p key={i} className="text-sm">{name(t.from)} → {name(t.to)} <span className="font-semibold">{formatINR(t.amount)}</span></p>
                ))}
                <p className="mt-1 text-[11px] text-muted">Suggestion only — fewest transfers within this group; your history is unchanged.</p>
              </Card>
            );
          })}
          {d.friend_groups.length > 0 && <Button className="w-full" onClick={() => setGroupEdit("new")}>+ New group</Button>}
        </div>
      )}

      {tab === "stats" && <Stats />}

      <SectionTitle>Recent shared expenses</SectionTitle>
      <Card className="p-1">
        {d.transactions.filter((t) => isLive(t) && t.my_share !== null).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 10).map((t) => (
          <Row key={t.id} left="🧾" title={t.merchant ?? "Shared expense"} sub={`${fmtDate(istDate(t.occurred_at))} · ${t.paid_by_friend_id ? `${d.friends.find((f) => f.id === t.paid_by_friend_id)?.name} paid` : "you paid"}`} right={<div><Amount value={t.amount} className="font-medium" /><div className="text-[11px] text-muted">your share {formatINR(t.my_share ?? 0)}</div></div>} />
        ))}
        {!d.transactions.some((t) => t.my_share !== null) && <p className="py-4 text-center text-sm text-muted">No shared expenses yet.</p>}
      </Card>

      <FriendSheet open={addFriend} onClose={() => setAddFriend(false)} />
      <GroupSheet id={groupEdit} onClose={() => setGroupEdit(null)} />
      <OutingSheet open={outing} onClose={() => setOuting(false)} />
    </div>
  );
}

function Stats() {
  const d = useData();
  const data = useMemo(() => {
    const shared = d.transactions.filter((t) => isLive(t) && t.my_share !== null && t.type === "expense");
    const withF = new Map<string, number>();
    const payers = new Map<string, number>();
    for (const t of shared) {
      for (const s of d.transaction_splits.filter((x) => x.transaction_id === t.id && x.friend_id)) withF.set(s.friend_id!, (withF.get(s.friend_id!) ?? 0) + (t.my_share ?? 0));
      const p = t.paid_by_friend_id ?? (t.payers ? "several" : "me");
      payers.set(p, (payers.get(p) ?? 0) + 1);
    }
    const outings = new Set(shared.map((t) => `${istDate(t.occurred_at)}-${t.group_id ?? ""}`)).size;
    return { shared, withF: [...withF].sort((a, b) => b[1] - a[1]), payers: [...payers].sort((a, b) => b[1] - a[1]), outings, avg: outings ? shared.reduce((a, t) => a + (t.my_share ?? 0), 0) / outings : 0 };
  }, [d]);
  const name = (k: string) => (k === "me" ? "You" : k === "several" ? "Several people" : d.friends.find((f) => f.id === k)?.name ?? "?");
  return (
    <div className="mt-3 space-y-2">
      <Card>
        <p className="text-xs text-muted">Average spend per outing (your share)</p>
        <p className="text-xl font-bold"><Amount value={data.avg} /></p>
        <p className="text-xs text-muted">{data.outings} outings · {data.shared.length} shared bills</p>
      </Card>
      <Card>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Who you spend most with</p>
        {data.withF.slice(0, 5).map(([id, v]) => <div key={id} className="flex justify-between text-sm"><span>{name(id)}</span><Amount value={v} /></div>)}
        {data.withF.length === 0 && <p className="text-sm text-muted">—</p>}
      </Card>
      <Card>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Who usually pays</p>
        {data.payers.map(([id, n]) => <div key={id} className="flex justify-between text-sm"><span>{name(id)}</span><span>{n} bills</span></div>)}
        {data.payers.length === 0 && <p className="text-sm text-muted">—</p>}
      </Card>
    </div>
  );
}

function GroupSheet({ id, onClose }: { id: string | "new" | null; onClose: () => void }) {
  const d = useData();
  const g = id && id !== "new" ? d.friend_groups.find((x) => x.id === id) : undefined;
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🍻");
  const [members, setMembers] = useState<string[]>([]);
  useEffect(() => {
    if (!id) return;
    setName(g?.name ?? "");
    setEmoji(g?.emoji ?? "🍻");
    setMembers(g ? d.group_members.filter((m) => m.group_id === g.id).map((m) => m.friend_id) : []);
  }, [id, g, d.group_members]);
  return (
    <Sheet open={!!id} onClose={onClose} title={g ? "Edit group" : "New group"}>
      <div className="grid grid-cols-[72px_1fr] gap-3">
        <Field label="Emoji"><Input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="text-center" /></Field>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend Gang" /></Field>
      </div>
      <p className="mb-2 text-xs text-muted">Members</p>
      <div className="flex flex-wrap gap-2">
        {d.friends.filter((f) => !f.archived).map((f) => (
          <Chip key={f.id} active={members.includes(f.id)} color={f.color} onClick={() => setMembers(members.includes(f.id) ? members.filter((x) => x !== f.id) : [...members, f.id])}>{f.name}</Chip>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        {g && <Button variant="danger" onClick={() => { deleteGroup(g.id); onClose(); }}>Delete</Button>}
        <Button variant="primary" className="flex-1" disabled={!name || !members.length} onClick={() => { saveGroup(g?.id ?? null, name, emoji, members); onClose(); }}>Save</Button>
      </div>
    </Sheet>
  );
}

interface OutingBill { amount: number; payer: string; note: string }
const OUTING_KEY = "paisa-outing";

/** Outing mode: add bills through the night, close it and split once. */
function OutingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const d = useData();
  const [people, setPeople] = useState<string[]>([]);
  const [bills, setBills] = useState<OutingBill[]>([]);
  const [amt, setAmt] = useState("");
  const [payer, setPayer] = useState("me");
  const [note, setNote] = useState("");
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(OUTING_KEY) ?? "null");
      if (s) { setPeople(s.people); setBills(s.bills); }
    } catch {}
  }, [open]);
  useEffect(() => {
    try { localStorage.setItem(OUTING_KEY, JSON.stringify({ people, bills })); } catch {}
  }, [people, bills]);
  const total = bills.reduce((a, b) => a + b.amount, 0);
  const n = people.length + 1;
  const name = (k: string) => (k === "me" ? "You" : d.friends.find((f) => f.id === k)?.name ?? "?");

  function close() {
    const dining = categoryByPath("Food › Dining out")?.id ?? null;
    const bank = defaultAccountFor("upi")?.id ?? null;
    for (const b of bills) {
      addTransaction({
        amount: b.amount, merchant: b.note || "Outing", category_id: dining, account_id: b.payer === "me" ? bank : null, method: "upi",
        split: { mode: "equal", participants: [{ friend_id: null }, ...people.map((p) => ({ friend_id: p }))], payerFriendId: b.payer === "me" ? null : b.payer },
      }, { silent: true });
    }
    setBills([]);
    setPeople([]);
    try { localStorage.removeItem(OUTING_KEY); } catch {}
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="🌙 Outing">
      <p className="mb-2 text-xs text-muted">Who&apos;s out tonight?</p>
      <div className="flex flex-wrap gap-2">
        {d.friends.filter((f) => !f.archived).map((f) => (
          <Chip key={f.id} active={people.includes(f.id)} color={f.color} onClick={() => setPeople(people.includes(f.id) ? people.filter((x) => x !== f.id) : [...people, f.id])}>{f.name}</Chip>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[1fr_1fr] gap-2">
        <Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Bill ₹" aria-label="Bill amount" />
        <Select value={payer} onChange={(e) => setPayer(e.target.value)} aria-label="Paid by">
          <option value="me">You paid</option>
          {people.map((p) => <option key={p} value={p}>{name(p)} paid</option>)}
        </Select>
        <Input className="col-span-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dinner at Toit, cab home…" />
      </div>
      <Button className="mt-2 w-full" disabled={!parseAmount(amt)} onClick={() => { setBills([...bills, { amount: parseAmount(amt)!, payer, note }]); setAmt(""); setNote(""); }}>+ Add bill</Button>
      {bills.length > 0 && (
        <div className="mt-3 rounded-xl border border-line p-2">
          {bills.map((b, i) => (
            <div key={i} className="flex justify-between text-sm"><span>{b.note || "Bill"} · {name(b.payer)}</span><Amount value={b.amount} /></div>
          ))}
          <div className="mt-1 flex justify-between border-t border-line pt-1 text-sm font-semibold"><span>Total · {n} people</span><Amount value={total} /></div>
          <p className="text-xs text-muted">Your share ≈ {formatINR(total / n)}</p>
        </div>
      )}
      <Button variant="primary" className="mt-3 w-full" disabled={!bills.length || !people.length} onClick={close}>Close outing & split equally</Button>
      <p className="mt-2 text-center text-[11px] text-muted"><Link href="/friends" onClick={onClose}>The outing is kept on this device until you close it.</Link></p>
    </Sheet>
  );
}
