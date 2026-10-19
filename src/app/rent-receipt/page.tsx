"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { fmtDate, fmtMonth, istDate } from "@/lib/domain/dates";
import { formatINR } from "@/lib/domain/money";
import { postedFor } from "@/lib/domain/recurring";
import { rupeesInWords } from "@/lib/domain/tax";
import { getProfile } from "@/lib/store/actions";
import { useData } from "@/lib/store/selectors";

export default function RentReceiptPage() {
  return (
    <Suspense>
      <Receipts />
    </Suspense>
  );
}

/** Printable monthly rent receipts for HRA claims — use the browser's "Save as PDF". */
function Receipts() {
  const params = useSearchParams();
  const d = useData();
  const p = getProfile(d);
  const rule = d.recurring_rules.find((r) => r.id === params.get("rule"));
  const from = params.get("from") ?? "1970-01-01";
  const to = params.get("to") ?? "2999-12-31";
  if (!rule) return <p className="p-6">Rent rule not found.</p>;
  const payments = postedFor(rule, d.transactions)
    .filter((t) => istDate(t.occurred_at) >= from && istDate(t.occurred_at) <= to)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  return (
    <div className="min-h-dvh bg-white p-6 text-black">
      <div className="no-print mb-6 flex items-center justify-between">
        <Link href="/plan/recurring" className="text-sm text-blue-700">← Back</Link>
        <button onClick={() => window.print()} className="rounded-lg bg-black px-4 py-2 text-sm text-white">Print / Save as PDF</button>
      </div>
      {payments.length === 0 && <p>No rent payments recorded between {fmtDate(from, true)} and {fmtDate(to, true)}.</p>}
      {payments.map((t, i) => {
        const date = istDate(t.occurred_at);
        return (
          <section key={t.id} className="mx-auto mb-8 max-w-2xl border-2 border-black p-6" style={{ breakInside: "avoid", pageBreakAfter: i % 2 === 1 ? "always" : "auto" }}>
            <div className="flex justify-between">
              <h1 className="text-xl font-bold tracking-wide">RENT RECEIPT</h1>
              <span className="text-sm">No. {String(i + 1).padStart(3, "0")}</span>
            </div>
            <p className="mt-1 text-sm">Date: {fmtDate(date, true)}</p>
            <p className="mt-5 leading-8">
              Received with thanks from <b>{p.name}</b> a sum of <b>{formatINR(t.amount)}</b> (<i>{rupeesInWords(t.amount)}</i>) towards rent for the month of{" "}
              <b>{fmtMonth(date)}</b> for the property at <b>{rule.property_address ?? "________________________"}</b>, paid by {t.method === "cash" ? "cash" : `${t.method.toUpperCase()}`}.
            </p>
            <div className="mt-10 flex items-end justify-between text-sm">
              <div>
                <p>Landlord: <b>{rule.landlord ?? "________________"}</b></p>
                <p>PAN: {rule.landlord_pan ?? "________________"}</p>
              </div>
              <div className="text-center">
                <div className="mb-1 h-14 w-28 border border-dashed border-gray-500 text-[10px] leading-[56px] text-gray-500">Revenue stamp</div>
                <p>Signature of landlord</p>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
