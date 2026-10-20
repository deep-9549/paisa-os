"use client";

import { ClipboardPaste, MessageSquareText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Amount, Badge, Button, Card, PageHeader, SectionTitle, Textarea, cn } from "@/components/ui";
import { fmtDate, istDate } from "@/lib/domain/dates";
import { likelyLogged, parseBankSms, splitSmsBatch } from "@/lib/domain/sms";
import { addTransaction, categoryPath, smsToTxn } from "@/lib/store/actions";
import { useData } from "@/lib/store/selectors";
import { useStore } from "@/lib/store/store";

const SAMPLE = `Rs.450.00 debited from A/c XX1234 on 18-10-26 to VPA swiggy@icici UPI Ref 123456789. -Bank of India

INR 1,200 spent on BOI RuPay Credit Card XX4821 at AMAZON on 17-Oct-26.`;

export default function CatchUpPage() {
  const d = useData();
  const router = useRouter();
  const [text, setText] = useState("");
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [touched, setTouched] = useState(false);

  const rows = useMemo(() => {
    return splitSmsBatch(text)
      .map((raw) => ({ raw, s: parseBankSms(raw) }))
      .filter((r): r is { raw: string; s: NonNullable<typeof r.s> } => !!r.s)
      .map((r) => ({ ...r, txn: smsToTxn(r.s, d), dup: likelyLogged(r.s, d.transactions, istDate) }));
  }, [text, d]);

  // Until the user changes a tick, likely duplicates start unticked.
  const isOn = (i: number) => (touched ? !skip.has(i) : !rows[i].dup);
  const toggle = (i: number) => {
    const base = touched ? new Set(skip) : new Set(rows.map((r, j) => (r.dup ? j : -1)).filter((j) => j >= 0));
    if (base.has(i)) base.delete(i);
    else base.add(i);
    setSkip(base);
    setTouched(true);
  };
  const chosen = rows.filter((_, i) => isOn(i));

  const importAll = () => {
    for (const r of chosen) addTransaction(r.txn, { silent: true });
    useStore.getState().toast({ text: `Imported ${chosen.length} transaction${chosen.length === 1 ? "" : "s"}` });
    router.push("/activity");
  };

  return (
    <div>
      <PageHeader back="/activity" title="Catch up from SMS" subtitle="Missed a few days? Paste your bank messages and import them in one go." />

      <Textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setTouched(false); setSkip(new Set()); }}
        placeholder="Paste bank SMS here — one or many. Blank lines between messages help."
        aria-label="Bank SMS"
        className="min-h-40 text-sm"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={async () => {
            try {
              setText(await navigator.clipboard.readText());
            } catch {
              useStore.getState().toast({ text: "Clipboard blocked — long-press the box and paste" });
            }
          }}
        >
          <ClipboardPaste size={15} aria-hidden /> Paste from clipboard
        </Button>
        {!text && <Button size="sm" variant="ghost" onClick={() => setText(SAMPLE)}>Try a sample</Button>}
      </div>

      {text && rows.length === 0 && (
        <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-sm text-muted">No debit or credit messages found. OTPs and balance alerts are skipped.</p>
      )}

      {rows.length > 0 && (
        <>
          <SectionTitle>{rows.length} found · {chosen.length} to import</SectionTitle>
          <Card className="p-1.5">
            {rows.map((r, i) => {
              const on = isOn(i);
              const t = r.txn;
              return (
                <button key={i} onClick={() => toggle(i)} className={cn("flex w-full items-start gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-surface-2", !on && "opacity-50")} aria-pressed={on}>
                  <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs", on ? "border-accent bg-accent text-accent-ink" : "border-line")}>{on && "✓"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-medium">{t.merchant ?? (t.type === "income" ? "Money received" : "Payment")}</span>
                      {r.dup && <Badge tone="warn">already logged?</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {t.occurred_at ? fmtDate(istDate(t.occurred_at)) : ""} · {t.method?.toUpperCase()} · {categoryPath(t.category_id ?? null, d.categories)}
                      {t.account_id && ` · ${d.accounts.find((a) => a.id === t.account_id)?.name ?? ""}`}
                    </span>
                  </span>
                  <Amount value={t.type === "income" ? t.amount : -t.amount} sign={t.type === "income"} className={cn("text-sm font-semibold", t.type === "income" && "text-good")} />
                </button>
              );
            })}
          </Card>
          <Button variant="primary" size="lg" className="mt-4 w-full" disabled={!chosen.length} onClick={importAll}>
            Import {chosen.length} transaction{chosen.length === 1 ? "" : "s"}
          </Button>
          <p className="mt-2 text-center text-xs text-muted">Edit any of them afterwards from Activity. Categories come from your past choices.</p>
        </>
      )}

      {!text && (
        <Card className="mt-6">
          <div className="flex gap-3">
            <MessageSquareText className="shrink-0 text-accent" size={20} aria-hidden />
            <div className="text-sm">
              <p className="font-semibold">Works with most Indian banks</p>
              <p className="mt-1 text-muted">Copy debit and credit messages from your SMS app — one at a time or several together — and paste them above. OTPs and balance alerts are ignored, and nothing leaves your device.</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
