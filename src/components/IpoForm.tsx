"use client";

import { useState } from "react";
import { addDays, istDate } from "@/lib/domain/dates";
import { blockedAmount } from "@/lib/domain/ipo";
import { formatINR, parseAmount } from "@/lib/domain/money";
import { applyIpo, getProfile, updateIpo } from "@/lib/store/actions";
import { useData } from "@/lib/store/selectors";
import type { IpoApplication } from "@/lib/types";
import { Button, Field, Input, Select } from "./ui";

export function IpoForm({ initial, onDone }: { initial?: IpoApplication; onDone: () => void }) {
  const d = useData();
  const profile = getProfile(d);
  const banks = d.accounts.filter((a) => !a.archived && (a.type === "savings" || a.type === "wallet"));
  const [company, setCompany] = useState(initial?.company ?? "");
  const [category, setCategory] = useState<IpoApplication["category"]>(initial?.category ?? "retail");
  const [applicant, setApplicant] = useState(initial?.applicant ?? "self");
  const [lots, setLots] = useState(String(initial?.lots ?? 1));
  const [lotSize, setLotSize] = useState(initial ? String(initial.lot_size) : "");
  const [low, setLow] = useState(initial?.price_band_low ? String(initial.price_band_low) : "");
  const [high, setHigh] = useState(initial?.price_band_high ? String(initial.price_band_high) : "");
  const [bid, setBid] = useState(initial ? String(initial.bid_price) : "");
  const [accountId, setAccountId] = useState(initial?.account_id ?? banks[0]?.id ?? "");
  const [applied, setApplied] = useState(initial?.applied_date ?? istDate());
  const [mandate, setMandate] = useState(initial?.mandate_date ?? addDays(istDate(), 3));
  const [allot, setAllot] = useState(initial?.allotment_date ?? addDays(istDate(), 4));
  const [listing, setListing] = useState(initial?.listing_date ?? addDays(istDate(), 6));

  const bidPrice = parseAmount(bid) ?? parseAmount(high) ?? 0;
  const L = parseInt(lots, 10) || 0;
  const S = parseInt(lotSize, 10) || 0;
  const amount = blockedAmount(L, S, bidPrice);
  const valid = company.trim() && L > 0 && S > 0 && bidPrice > 0 && accountId;

  function save() {
    if (!valid) return;
    const fields = {
      company: company.trim(), category, applicant, lots: L, lot_size: S, price_band_low: parseAmount(low), price_band_high: parseAmount(high),
      bid_price: bidPrice, issue_price: initial?.issue_price ?? null, account_id: accountId, applied_date: applied, mandate_date: mandate || null,
      allotment_date: allot || null, listing_date: listing || null,
    };
    if (initial) updateIpo(initial, fields);
    else applyIpo(fields);
    onDone();
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3">
        <div className="col-span-2">
          <Field label="IPO / company">
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Technologies" autoFocus />
          </Field>
        </div>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as IpoApplication["category"])}>
            <option value="retail">Retail</option>
            <option value="shni">sHNI</option>
            <option value="employee">Employee</option>
            <option value="shareholder">Shareholder</option>
          </Select>
        </Field>
        <Field label="Applicant PAN">
          <Select value={applicant} onChange={(e) => setApplicant(e.target.value)}>
            <option value="self">Self</option>
            {profile.family_pans.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Price band low">
          <Input inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} placeholder="140" />
        </Field>
        <Field label="Price band high">
          <Input inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} placeholder="150" />
        </Field>
        <Field label="Lots">
          <Input inputMode="numeric" value={lots} onChange={(e) => setLots(e.target.value)} />
        </Field>
        <Field label="Lot size (shares)">
          <Input inputMode="numeric" value={lotSize} onChange={(e) => setLotSize(e.target.value)} placeholder="100" />
        </Field>
        <Field label="Bid price" hint="Cut-off = top of band for retail">
          <Input inputMode="decimal" value={bid} onChange={(e) => setBid(e.target.value)} placeholder={high || "150"} />
        </Field>
        <Field label="Blocked in">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {banks.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Applied on">
          <Input type="date" value={applied} onChange={(e) => setApplied(e.target.value)} />
        </Field>
        <Field label="UPI mandate by">
          <Input type="date" value={mandate} onChange={(e) => setMandate(e.target.value)} />
        </Field>
        <Field label="Allotment date">
          <Input type="date" value={allot} onChange={(e) => setAllot(e.target.value)} />
        </Field>
        <Field label="Listing date">
          <Input type="date" value={listing} onChange={(e) => setListing(e.target.value)} />
        </Field>
      </div>
      <div className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">
        Blocks <span className="font-semibold">{formatINR(amount)}</span> ({L} × {S} × {formatINR(bidPrice, { decimals: bidPrice % 1 !== 0 })}). Safe-to-Spend drops by this until refund or allotment.
      </div>
      <Button variant="primary" size="lg" className="mt-4 w-full" disabled={!valid} onClick={save}>
        {initial ? "Save IPO" : "Apply & block funds"}
      </Button>
    </div>
  );
}
