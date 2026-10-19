"use client";

import { useEffect, useState } from "react";
import { newFriend, saveFriend } from "@/lib/store/actions";
import { useData } from "@/lib/store/selectors";
import { Button, Field, Input, Sheet } from "./ui";

export function FriendSheet({ open, onClose, id }: { open: boolean; onClose: () => void; id?: string }) {
  const d = useData();
  const ex = id ? d.friends.find((f) => f.id === id) : undefined;
  const [name, setName] = useState(ex?.name ?? "");
  const [upi, setUpi] = useState(ex?.upi_id ?? "");
  const [phone, setPhone] = useState(ex?.phone ?? "");
  useEffect(() => {
    if (open) { setName(ex?.name ?? ""); setUpi(ex?.upi_id ?? ""); setPhone(ex?.phone ?? ""); }
  }, [open, ex?.name, ex?.upi_id, ex?.phone]);
  return (
    <Sheet open={open} onClose={onClose} title={ex ? "Edit friend" : "Add friend"}>
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
      <Field label="UPI ID"><Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="rahul@okicici" /></Field>
      <Field label="Phone (for WhatsApp)"><Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      <div className="flex gap-2">
        {ex && <Button variant="danger" onClick={() => { saveFriend({ ...ex, archived: true }); onClose(); }}>Archive</Button>}
        <Button variant="primary" className="flex-1" disabled={!name.trim()} onClick={() => { saveFriend(ex ? { ...ex, name: name.trim(), upi_id: upi || null, phone: phone || null } : newFriend(name.trim(), { upi_id: upi || null, phone: phone || null })); onClose(); }}>Save</Button>
      </div>
    </Sheet>
  );
}
