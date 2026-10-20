"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store/store";
import { IpoForm } from "./IpoForm";
import { TxnForm } from "./TxnForm";
import { Sheet } from "./ui";

export function QuickAddSheet() {
  const q = useStore((s) => s.quickAdd);
  const setQ = useStore((s) => s.setQuickAdd);
  const [ipo, setIpo] = useState(false);
  const close = () => {
    setQ({ open: false });
    setIpo(false);
  };
  return (
    <Sheet open={q.open} onClose={close} title={ipo ? "New IPO application" : "Add"}>
      {ipo ? (
        <IpoForm onDone={close} />
      ) : (
        <>
          <TxnForm key={`${q.text ?? ""}-${q.mode ?? ""}`} presetText={q.text} mode={(q.mode as "expense") ?? "expense"} onDone={close} />
          <div className="mt-2 flex">
            <Link href="/catch-up" onClick={close} className="flex min-h-11 flex-1 items-center justify-center text-sm text-muted hover:text-ink">
              📩 Several SMS to log?
            </Link>
            <button className="min-h-11 flex-1 text-sm text-muted hover:text-ink" onClick={() => setIpo(true)}>
              🚀 Applying for an IPO?
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
