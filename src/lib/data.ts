"use client";

// Export / import / delete-all (PRD 4.12) and bank-statement CSV import (4.11).

import { dateToTs, istDate } from "./domain/dates";
import { parseAmount } from "./domain/money";
import { keywordCategory } from "./domain/parser";
import { autoFill, baseTxn, categoryByPath, categoryPath } from "./store/actions";
import { clearAll } from "./store/db";
import { type Change, emptyTables, getData, useStore } from "./store/store";
import { supabase } from "./supabase";
import { TABLE_NAMES, type Tables, type Transaction } from "./types";

export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
}

export function transactionsCsv(d: Tables = getData()): string {
  const acc = new Map(d.accounts.map((a) => [a.id, a.name]));
  const fr = new Map(d.friends.map((f) => [f.id, f.name]));
  return toCsv(
    d.transactions
      .filter((t) => !t.deleted_at)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .map((t) => ({
        date: istDate(t.occurred_at),
        time: new Date(t.occurred_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }),
        type: t.type,
        amount: t.amount,
        my_share: t.my_share ?? t.amount,
        merchant: t.merchant ?? "",
        category: categoryPath(t.category_id, d.categories),
        method: t.method,
        account: t.account_id ? acc.get(t.account_id) ?? "" : "",
        to_account: t.to_account_id ? acc.get(t.to_account_id) ?? "" : "",
        paid_by: t.paid_by_friend_id ? fr.get(t.paid_by_friend_id) ?? "" : "",
        tags: t.tags.join(" "),
        note: t.note ?? "",
        excluded_from_budget: t.exclude_from_budget,
      })),
  );
}

export function exportJson(d: Tables = getData()): string {
  return JSON.stringify({ app: "paisa-os", version: 1, exported_at: new Date().toISOString(), data: d }, null, 2);
}

export function importJson(text: string) {
  const parsed = JSON.parse(text);
  const data = (parsed.data ?? parsed) as Partial<Tables>;
  if (!data.accounts || !data.transactions) throw new Error("Not a Paisa OS export");
  const full = { ...emptyTables(), ...data } as Tables;
  const changes: Change[] = [];
  for (const t of TABLE_NAMES) for (const r of full[t] as unknown as Record<string, unknown>[]) changes.push({ table: t, op: "upsert", row: r });
  useStore.getState().replaceAll(emptyTables());
  useStore.getState().commit(changes);
}

export async function deleteAll() {
  const sb = supabase();
  const userId = useStore.getState().userId;
  if (sb && userId) {
    // Children first so foreign keys don't block deletes.
    for (const t of [...TABLE_NAMES].reverse()) await sb.from(t).delete().eq("user_id", userId);
  }
  await clearAll();
  useStore.getState().replaceAll(emptyTables());
  try {
    localStorage.clear();
  } catch {}
}

// ---------- bank statement CSV ----------

export interface CsvMapping {
  date: number;
  description: number;
  debit: number; // or amount column when single
  credit: number; // -1 if single signed amount column
  dateFormat: "dmy" | "mdy" | "ymd";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell.trim()); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((x) => x)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x)) rows.push(row);
  return rows;
}

export function guessMapping(header: string[]): CsvMapping {
  const h = header.map((x) => x.toLowerCase());
  const find = (...k: string[]) => h.findIndex((x) => k.some((y) => x.includes(y)));
  const debit = find("debit", "withdrawal", "dr");
  const credit = find("credit", "deposit", "cr");
  return {
    date: Math.max(find("date", "txn date", "value date"), 0),
    description: Math.max(find("description", "narration", "particulars", "remarks", "details"), 1),
    debit: debit >= 0 ? debit : find("amount"),
    credit: debit >= 0 ? credit : -1,
    dateFormat: "dmy",
  };
}

function toIsoDate(s: string, fmt: CsvMapping["dateFormat"]): string | null {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const m = s.match(/(\d{1,4})[-/. ]([a-z]{3}|\d{1,2})[-/. ](\d{2,4})/i);
  if (!m) return null;
  const [a, c] = [m[1], m[3]];
  let b = m[2];
  if (/^[a-z]/i.test(b)) b = String(months.indexOf(b.toLowerCase()) + 1);
  let y: number, mo: number, d: number;
  if (fmt === "ymd" || a.length === 4) [y, mo, d] = [+a, +b, +c];
  else if (fmt === "mdy") [mo, d, y] = [+a, +b, +c];
  else [d, mo, y] = [+a, +b, +c];
  if (y < 100) y += 2000;
  if (!mo || mo > 12 || !d || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface CsvPreviewRow {
  date: string;
  description: string;
  amount: number;
  direction: "debit" | "credit";
  duplicate: boolean;
  categoryId: string | null;
}

export function previewCsv(rows: string[][], map: CsvMapping, accountId: string): CsvPreviewRow[] {
  const d = getData();
  const out: CsvPreviewRow[] = [];
  for (const r of rows) {
    const date = toIsoDate(r[map.date] ?? "", map.dateFormat);
    if (!date) continue;
    let amount: number | null;
    let direction: "debit" | "credit";
    if (map.credit >= 0) {
      const dr = parseAmount(r[map.debit] ?? "") ?? 0;
      const cr = parseAmount(r[map.credit] ?? "") ?? 0;
      amount = dr || cr;
      direction = dr ? "debit" : "credit";
    } else {
      const raw = (r[map.debit] ?? "").replace(/[₹,\s]/g, "");
      const neg = raw.startsWith("-") || /dr$/i.test(raw);
      amount = parseAmount(raw.replace(/^-|dr$|cr$/gi, ""));
      direction = neg ? "debit" : "credit";
    }
    if (!amount) continue;
    const description = (r[map.description] ?? "").slice(0, 80);
    const duplicate = d.transactions.some(
      (t) => !t.deleted_at && t.account_id === accountId && t.amount === amount && istDate(t.occurred_at) === date,
    );
    const auto = autoFill(description, d);
    const categoryId = auto?.category_id ?? categoryByPath(keywordCategory(description), d.categories)?.id ?? null;
    out.push({ date, description, amount, direction, duplicate, categoryId });
  }
  return out;
}

export function commitCsv(rows: CsvPreviewRow[], accountId: string, skipDuplicates: boolean) {
  const changes: Change[] = [];
  const isCard = getData().credit_cards.some((c) => c.account_id === accountId);
  for (const r of rows) {
    if (skipDuplicates && r.duplicate) continue;
    const t: Transaction = baseTxn({
      type: r.direction === "debit" ? "expense" : isCard ? "card_payment" : "income",
      amount: r.amount,
      account_id: r.direction === "credit" && isCard ? null : accountId,
      to_account_id: r.direction === "credit" && isCard ? accountId : null,
      method: isCard ? "card" : /upi/i.test(r.description) ? "upi" : /atm|cash/i.test(r.description) ? "cash" : "netbanking",
      merchant: cleanDesc(r.description),
      category_id: r.categoryId,
      occurred_at: dateToTs(r.date),
      note: "Imported from CSV",
    });
    if (t.type === "card_payment" && !t.account_id) {
      // A credit on a card statement without a source account is recorded as an adjustment.
      t.type = "adjustment";
      t.account_id = accountId;
      t.to_account_id = null;
      t.adjustment_sign = 1;
      t.exclude_from_budget = true;
    }
    changes.push({ table: "transactions", op: "upsert", row: t as unknown as Record<string, unknown> });
  }
  useStore.getState().commit(changes);
  return changes.length;
}

function cleanDesc(s: string) {
  const vpa = s.match(/([a-z0-9.\-_]+)@[a-z]+/i);
  if (vpa) return vpa[1].replace(/[._-]+/g, " ").replace(/\d{4,}/g, "").trim() || s;
  return s.replace(/^(upi|neft|imps|pos|ach)[/-]?/i, "").split(/[/|]/)[0].trim() || s;
}
