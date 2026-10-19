"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Segmented, Select, Toggle } from "@/components/ui";
import { ordinal } from "@/lib/domain/cycle";
import { formatINR, parseAmount } from "@/lib/domain/money";
import { PROFILE_ID } from "@/lib/store/actions";
import { completeOnboarding, loadDemo, type OnboardingInput, suggestedBudgets } from "@/lib/store/setup";
import { hashPin } from "@/lib/security";

const STEPS = ["Welcome", "Salary", "Bank", "Card", "Rent & bills", "Budgets"];
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const BILL_PRESETS: OnboardingInput["bills"] = [
  { name: "Electricity", amount: 1200, dueDay: 18, variable: true, path: "Bills & Utilities › Electricity", kind: "bill" },
  { name: "Internet", amount: 799, dueDay: 10, variable: false, path: "Bills & Utilities › Internet", kind: "bill" },
  { name: "Mobile", amount: 349, dueDay: 12, variable: false, path: "Bills & Utilities › Mobile", kind: "bill" },
  { name: "Netflix", amount: 199, dueDay: 22, variable: false, path: "Bills & Utilities › Subscriptions", kind: "subscription" },
  { name: "Spotify", amount: 119, dueDay: 2, variable: false, path: "Bills & Utilities › Subscriptions", kind: "subscription" },
];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Deep");
  const [pin, setPin] = useState("");
  const [salary, setSalary] = useState("");
  const [cycleMode, setCycleMode] = useState<OnboardingInput["cycleMode"]>("calendar");
  const [startDay, setStartDay] = useState(1);
  const [salaryDay, setSalaryDay] = useState(1);
  const [banks, setBanks] = useState([{ name: "Bank of India Savings", balance: "", upi: "" }]);
  const [cash, setCash] = useState("");
  const [hasCard, setHasCard] = useState(true);
  const [card, setCard] = useState({ name: "BOI RuPay Credit Card", last4: "", limit: "", statementDay: 15, dueMode: "after_statement" as "fixed" | "after_statement", dueDay: 5, graceDays: "20", unbilled: "", rupayUpi: true, annualFee: "0", waiver: "" });
  const [hasRent, setHasRent] = useState(true);
  const [rent, setRent] = useState({ amount: "", dueDay: 5, landlord: "", deposit: "" });
  const [bills, setBills] = useState<Record<string, { on: boolean; amount: string; dueDay: number }>>(
    Object.fromEntries(BILL_PRESETS.map((b, i) => [b.name, { on: i < 3, amount: String(b.amount), dueDay: b.dueDay }])),
  );
  const sal = parseAmount(salary) ?? 0;
  const [budgets, setBudgets] = useState<{ path: string; amount: string }[] | null>(null);
  const budgetRows = budgets ?? suggestedBudgets(sal).map((b) => ({ path: b.path, amount: String(b.amount) }));

  const canNext = [true, sal > 0, banks.every((b) => b.name && parseAmount(b.balance || "0") !== null), !hasCard || (card.last4.length === 4 && (parseAmount(card.limit) ?? 0) > 0), !hasRent || (parseAmount(rent.amount) ?? 0) > 0, true][step];

  const [finishError, setFinishError] = useState<string | null>(null);

  async function finish() {
    try {
      await doFinish();
    } catch (e) {
      setFinishError((e as Error).message || "Something went wrong saving your setup.");
    }
  }

  async function doFinish() {
    completeOnboarding({
      name,
      pinHash: pin.length === 4 ? await hashPin(pin, PROFILE_ID) : null,
      salary: sal,
      cycleMode,
      startDay: cycleMode === "calendar" ? 1 : cycleMode === "salary" ? salaryDay : startDay,
      salaryDay,
      banks: banks.map((b) => ({ name: b.name, balance: parseAmount(b.balance || "0") ?? 0, upi: b.upi })),
      cash: parseAmount(cash || "0") ?? 0,
      card: hasCard
        ? { name: card.name, last4: card.last4, limit: parseAmount(card.limit) ?? 0, statementDay: card.statementDay, dueMode: card.dueMode, dueDay: card.dueDay, graceDays: parseInt(card.graceDays) || 20, unbilled: parseAmount(card.unbilled || "0") ?? 0, rupayUpi: card.rupayUpi, annualFee: parseAmount(card.annualFee || "0") ?? 0, waiver: parseAmount(card.waiver || "") }
        : null,
      rent: hasRent ? { amount: parseAmount(rent.amount) ?? 0, dueDay: rent.dueDay, landlord: rent.landlord, deposit: parseAmount(rent.deposit || "0") ?? 0 } : null,
      bills: BILL_PRESETS.filter((b) => bills[b.name].on).map((b) => ({ ...b, amount: parseAmount(bills[b.name].amount) ?? b.amount, dueDay: bills[b.name].dueDay })),
      budgets: budgetRows.map((b) => ({ path: b.path, amount: parseAmount(b.amount) ?? 0 })),
    });
    router.replace("/");
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 py-6">
      <div className="mb-6 flex gap-1" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-surface-3"}`} />
        ))}
      </div>

      {step === 0 && (
        <section>
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-3xl font-bold text-accent-ink">₹</div>
          <h1 className="text-3xl font-bold tracking-tight">Paisa OS</h1>
          <p className="mt-2 text-muted">One number, any moment: how much you can still safely spend this month — after UPI, cards, rent, IPO blocks and friends.</p>
          <div className="mt-6">
            <Field label="Your name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="4-digit app PIN (optional)" hint="Locks the app after 5 minutes idle. You can add biometrics later in Settings.">
              <Input inputMode="numeric" type="password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" />
            </Field>
          </div>
          <p className="mt-2 text-xs text-muted">Takes about 3 minutes. Everything stays on this device unless you connect Supabase sync.</p>
        </section>
      )}

      {step === 1 && (
        <section>
          <h1 className="text-2xl font-bold">Salary & budget month</h1>
          <p className="mb-4 mt-1 text-sm text-muted">Salary differs between employers, so the budget month is fully configurable.</p>
          <Field label="Monthly take-home salary (₹)"><Input inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="85,000" autoFocus /></Field>
          <Field label="Salary usually lands on">
            <Select value={salaryDay} onChange={(e) => setSalaryDay(+e.target.value)}>
              {DAYS.map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}
            </Select>
          </Field>
          <Field label="Budget month">
            <Segmented value={cycleMode} onChange={setCycleMode} options={[{ value: "calendar", label: "Calendar" }, { value: "custom", label: "Custom day" }, { value: "salary", label: "Salary day" }]} />
          </Field>
          {cycleMode === "custom" && (
            <Field label="Cycle starts on" hint="Days past a month's end fall back to its last day.">
              <Select value={startDay} onChange={(e) => setStartDay(+e.target.value)}>
                {DAYS.map((d) => <option key={d} value={d}>{ordinal(d)} → {ordinal(d === 1 ? 31 : d - 1)}</option>)}
              </Select>
            </Field>
          )}
          {cycleMode === "salary" && <p className="text-sm text-muted">The cycle starts the day salary actually lands, so an early or late salary before a holiday shifts it automatically.</p>}
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="text-2xl font-bold">Bank accounts</h1>
          <p className="mb-4 mt-1 text-sm text-muted">Current balance and the UPI handle linked to it, so UPI spends debit the right account.</p>
          {banks.map((b, i) => (
            <div key={i} className="mb-3 rounded-2xl border border-line bg-surface p-3">
              <Field label="Account name"><Input value={b.name} onChange={(e) => setBanks(banks.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Current balance (₹)"><Input inputMode="decimal" value={b.balance} onChange={(e) => setBanks(banks.map((x, j) => (j === i ? { ...x, balance: e.target.value } : x)))} placeholder="0" /></Field>
                <Field label="UPI handle"><Input value={b.upi} onChange={(e) => setBanks(banks.map((x, j) => (j === i ? { ...x, upi: e.target.value } : x)))} placeholder="deep@boi" /></Field>
              </div>
            </div>
          ))}
          <Button size="sm" onClick={() => setBanks([...banks, { name: "", balance: "", upi: "" }])}>+ Another bank</Button>
          <div className="mt-4"><Field label="Cash in wallet (₹)"><Input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" /></Field></div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h1 className="text-2xl font-bold">Credit card</h1>
          <p className="mb-3 mt-1 text-sm text-muted">Swipes count on the spend date, so the bill is never counted twice.</p>
          <Toggle checked={hasCard} onChange={setHasCard} label="I have a credit card" />
          {hasCard && (
            <div className="mt-2 grid grid-cols-2 gap-x-3">
              <div className="col-span-2"><Field label="Card name"><Input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></Field></div>
              <Field label="Last 4 digits"><Input inputMode="numeric" maxLength={4} value={card.last4} onChange={(e) => setCard({ ...card, last4: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="Credit limit (₹)"><Input inputMode="decimal" value={card.limit} onChange={(e) => setCard({ ...card, limit: e.target.value })} /></Field>
              <Field label="Statement day">
                <Select value={card.statementDay} onChange={(e) => setCard({ ...card, statementDay: +e.target.value })}>{DAYS.map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}</Select>
              </Field>
              <Field label="Due">
                <Select value={card.dueMode} onChange={(e) => setCard({ ...card, dueMode: e.target.value as "fixed" | "after_statement" })}>
                  <option value="after_statement">N days after statement</option>
                  <option value="fixed">Fixed day of month</option>
                </Select>
              </Field>
              {card.dueMode === "fixed" ? (
                <Field label="Due day"><Select value={card.dueDay} onChange={(e) => setCard({ ...card, dueDay: +e.target.value })}>{DAYS.map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}</Select></Field>
              ) : (
                <Field label="Grace days"><Input inputMode="numeric" value={card.graceDays} onChange={(e) => setCard({ ...card, graceDays: e.target.value })} /></Field>
              )}
              <Field label="Current unbilled (₹)"><Input inputMode="decimal" value={card.unbilled} onChange={(e) => setCard({ ...card, unbilled: e.target.value })} placeholder="0" /></Field>
              <Field label="Annual fee (₹)"><Input inputMode="decimal" value={card.annualFee} onChange={(e) => setCard({ ...card, annualFee: e.target.value })} /></Field>
              <Field label="Fee waived above spend (₹)"><Input inputMode="decimal" value={card.waiver} onChange={(e) => setCard({ ...card, waiver: e.target.value })} placeholder="optional" /></Field>
              <div className="col-span-2"><Toggle checked={card.rupayUpi} onChange={(v) => setCard({ ...card, rupayUpi: v })} label="RuPay card linked to UPI" /></div>
            </div>
          )}
        </section>
      )}

      {step === 4 && (
        <section>
          <h1 className="text-2xl font-bold">Rent & bills</h1>
          <p className="mb-3 mt-1 text-sm text-muted">Fixed commitments are reserved from Safe-to-Spend first.</p>
          <Toggle checked={hasRent} onChange={setHasRent} label="I pay rent" />
          {hasRent && (
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="Rent (₹)"><Input inputMode="decimal" value={rent.amount} onChange={(e) => setRent({ ...rent, amount: e.target.value })} /></Field>
              <Field label="Due day"><Select value={rent.dueDay} onChange={(e) => setRent({ ...rent, dueDay: +e.target.value })}>{DAYS.map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}</Select></Field>
              <Field label="Landlord"><Input value={rent.landlord} onChange={(e) => setRent({ ...rent, landlord: e.target.value })} /></Field>
              <Field label="Deposit held (₹)"><Input inputMode="decimal" value={rent.deposit} onChange={(e) => setRent({ ...rent, deposit: e.target.value })} /></Field>
            </div>
          )}
          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Bills & subscriptions</p>
          {BILL_PRESETS.map((b) => (
            <div key={b.name} className="mb-2 flex items-center gap-2 rounded-xl border border-line bg-surface p-2">
              <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={bills[b.name].on} onChange={(e) => setBills({ ...bills, [b.name]: { ...bills[b.name], on: e.target.checked } })} aria-label={b.name} />
              <span className="flex-1 text-sm">{b.name}{b.variable && <span className="text-xs text-muted"> · varies</span>}</span>
              <Input className="h-9 w-24" inputMode="decimal" value={bills[b.name].amount} onChange={(e) => setBills({ ...bills, [b.name]: { ...bills[b.name], amount: e.target.value } })} aria-label={`${b.name} amount`} />
              <Select className="h-9 w-20" value={bills[b.name].dueDay} onChange={(e) => setBills({ ...bills, [b.name]: { ...bills[b.name], dueDay: +e.target.value } })} aria-label={`${b.name} due day`}>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </div>
          ))}
        </section>
      )}

      {step === 5 && (
        <section>
          <h1 className="text-2xl font-bold">Category budgets</h1>
          <p className="mb-4 mt-1 text-sm text-muted">Pre-filled from typical splits of {formatINR(sal)}. Each budget covers UPI, card and cash alike.</p>
          {budgetRows.map((b, i) => (
            <div key={b.path} className="mb-2 flex items-center gap-3">
              <span className="flex-1 text-sm">{b.path}</span>
              <Input className="h-10 w-32" inputMode="decimal" value={b.amount} onChange={(e) => setBudgets(budgetRows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} aria-label={`${b.path} budget`} />
            </div>
          ))}
        </section>
      )}

      <div className="mt-8 flex gap-2">
        {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
        {step < STEPS.length - 1 ? (
          <Button variant="primary" className="flex-1" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</Button>
        ) : (
          <Button variant="primary" className="flex-1" onClick={finish}>See my Safe-to-Spend →</Button>
        )}
      </div>
      {finishError && <p className="mt-3 text-sm text-bad" role="alert">Couldn&apos;t finish setup: {finishError}</p>}
      {step === 0 && (
        <button className="mt-6 min-h-11 w-full text-sm text-muted hover:text-ink" onClick={() => { loadDemo(); router.replace("/"); }}>
          Just exploring? Load demo data instead
        </button>
      )}
    </div>
  );
}
