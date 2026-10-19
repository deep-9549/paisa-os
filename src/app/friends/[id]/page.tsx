"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Amount, Avatar, Button, Card, Empty, Field, Input, PageHeader, Row, SectionTitle, Segmented, Select, Sheet } from "@/components/ui";
import { FriendSheet } from "@/components/FriendSheet";
import { fmtDate, istDate } from "@/lib/domain/dates";
import { billEffect, upiPayLink, whatsappRequest } from "@/lib/domain/friends";
import { isLive } from "@/lib/domain/ledger";
import { formatINR, parseAmount } from "@/lib/domain/money";
import { deleteSettlement, getProfile, settle } from "@/lib/store/actions";
import { useData, useFriendBalances } from "@/lib/store/selectors";

export default function FriendDetail() {
  const { id } = useParams<{ id: string }>();
  const d = useData();
  const p = getProfile(d);
  const bal = useFriendBalances().get(id) ?? 0;
  const f = d.friends.find((x) => x.id === id);
  const [settleOpen, setSettleOpen] = useState(false);
  const [edit, setEdit] = useState(false);

  const feed = useMemo(() => {
    const items: { date: string; title: string; sub: string; effect: number; sid?: string }[] = [];
    for (const t of d.transactions) {
      if (!isLive(t) || t.type !== "expense") continue;
      const sp = d.transaction_splits.filter((s) => s.transaction_id === t.id);
      if (!sp.some((s) => s.friend_id === id) && t.paid_by_friend_id !== id) continue;
      const eff = billEffect(t, sp).get(id) ?? 0;
      items.push({ date: istDate(t.occurred_at), title: t.merchant ?? "Shared expense", sub: `${formatINR(t.amount)} · ${t.paid_by_friend_id === id ? `${f?.name} paid` : t.paid_by_friend_id ? "someone else paid" : "you paid"}`, effect: eff });
    }
    for (const s of d.settlements.filter((x) => x.friend_id === id))
      items.push({ date: s.date, title: s.direction === "received" ? "You received" : "You paid", sub: s.note ?? "Settlement", effect: s.direction === "received" ? -s.amount : s.amount, sid: s.id });
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [d, id, f?.name]);

  if (!f) return <Empty icon="👤" title="Friend not found" />;
  const amount = Math.abs(bal);
  const myUpi = p.my_upi_id ?? d.upi_handles[0]?.handle ?? "";
  const requestText = `Hi ${f.name.split(" ")[0]}, you owe me ${formatINR(amount)} (Paisa OS).${myUpi ? ` Pay here: ${upiPayLink(myUpi, p.name, amount, "Settle up")}` : ""}`;

  return (
    <div>
      <PageHeader back="/friends" title={f.name} subtitle={f.upi_id ?? f.phone ?? ""} action={<Button size="sm" onClick={() => setEdit(true)}>Edit</Button>} />
      <Card className="flex flex-col items-center py-6 text-center">
        <Avatar name={f.name} color={f.color} size={64} />
        <p className="mt-3 text-sm text-muted">{bal === 0 ? "You're settled up" : bal > 0 ? `${f.name} owes you` : `You owe ${f.name}`}</p>
        <p className={`text-3xl font-bold ${bal > 0 ? "text-good" : bal < 0 ? "text-bad" : ""}`}><Amount value={amount} /></p>
        {bal !== 0 && (
          <div className="mt-4 flex w-full flex-wrap justify-center gap-2">
            {bal < 0 && f.upi_id && (
              <a href={upiPayLink(f.upi_id, f.name, amount, "Settle up via Paisa OS")} className="inline-flex h-11 items-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-ink">Pay {formatINR(amount)} via UPI</a>
            )}
            {bal > 0 && (
              <a href={whatsappRequest(f.phone, requestText)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-xl bg-[#25D366] px-4 text-sm font-medium text-black">Request on WhatsApp</a>
            )}
            {bal > 0 && <Button onClick={() => navigator.share?.({ text: requestText }) ?? navigator.clipboard.writeText(requestText)}>Share request</Button>}
            <Button onClick={() => setSettleOpen(true)}>Mark settled</Button>
          </div>
        )}
        {bal < 0 && !f.upi_id && <p className="mt-2 text-xs text-muted">Add {f.name}&apos;s UPI ID to pay with one tap.</p>}
      </Card>

      <SectionTitle>History</SectionTitle>
      <Card className="p-1">
        {feed.length === 0 && <p className="py-4 text-center text-sm text-muted">Nothing yet.</p>}
        {feed.map((x, i) => (
          <Row key={i} left={x.sid ? "🤝" : "🧾"} title={x.title} sub={`${fmtDate(x.date, true)} · ${x.sub}`} right={
            <div>
              <Amount value={x.effect} tone="auto" sign className="text-sm font-medium" />
              {x.sid && <button className="block text-[11px] text-muted" onClick={() => deleteSettlement(x.sid!)}>undo</button>}
            </div>
          } />
        ))}
      </Card>
      <p className="mt-2 px-1 text-[11px] text-muted">+ means {f.name} owes you more; − means you owe more. Settlements received add to Safe-to-Spend only when the money arrives.</p>

      <SettleSheet open={settleOpen} onClose={() => setSettleOpen(false)} friendId={id} bal={bal} />
      <FriendSheet open={edit} onClose={() => setEdit(false)} id={id} />
    </div>
  );
}

function SettleSheet({ open, onClose, friendId, bal }: { open: boolean; onClose: () => void; friendId: string; bal: number }) {
  const d = useData();
  const [dir, setDir] = useState<"received" | "paid">(bal > 0 ? "received" : "paid");
  const [amt, setAmt] = useState(String(Math.abs(bal)));
  const banks = d.accounts.filter((a) => !a.archived && a.type !== "credit_card" && a.type !== "demat");
  const [acc, setAcc] = useState(banks[0]?.id ?? "");
  return (
    <Sheet open={open} onClose={onClose} title="Record settlement">
      <Segmented value={dir} onChange={setDir} options={[{ value: "received", label: "I received" }, { value: "paid", label: "I paid" }]} />
      <div className="mt-3"><Field label="Amount"><Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field></div>
      <Field label={dir === "received" ? "Into account" : "From account"}>
        <Select value={acc} onChange={(e) => setAcc(e.target.value)}>{banks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
      </Field>
      <Button variant="primary" className="w-full" disabled={!parseAmount(amt)} onClick={() => { settle(friendId, dir, parseAmount(amt)!, acc || null); onClose(); }}>Save</Button>
    </Sheet>
  );
}
