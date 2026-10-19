"use client";

// Supabase sync. Local IndexedDB is the working copy; Supabase Postgres is the
// source of truth across devices. Writes flow through the outbox (offline
// queue); reads come from a full pull on sign-in and Realtime afterwards.

import type { RealtimeChannel } from "@supabase/supabase-js";
import { PRIMARY_KEY, TABLE_NAMES, type TableName, type Tables } from "../types";
import { ackOutbox, pendingOutbox } from "./db";
import { applyChanges, emptyTables, getData, setOnCommit, useStore, type Change } from "./store";
import { supabase } from "../supabase";

let flushing = false;

/** Tables keyed by deterministic text ids are unique per user on the server. */
const PER_USER_KEY = new Set<TableName>(["profiles", "merchant_memory", "net_worth_snapshots", "notifications", "job_runs"]);
const conflictTarget = (t: TableName) =>
  PER_USER_KEY.has(t) ? "user_id,id" : t === "card_cycles" ? "card_id,start_date" : PRIMARY_KEY[t];
/** Server-only columns that must never be written back (generated / trigger-owned). */
const SERVER_ONLY = new Set(["user_id", "amount_blocked", "pushed"]);
let channel: RealtimeChannel | null = null;

// Parent tables first so foreign keys resolve on a fresh database.
const ORDER: TableName[] = [
  "profiles", "accounts", "categories", "friends", "friend_groups", "recurring_rules", "ipo_applications",
  "credit_cards", "upi_handles", "card_cycles", "goals", "transactions", "card_emis", "transaction_splits",
  "group_members", "holds", "holdings", "settlements", "goal_contributions", "budget_lines", "rules",
  "merchant_memory", "templates", "net_worth_snapshots", "notifications", "audit_log", "job_runs",
];

export async function flushOutbox(): Promise<void> {
  const sb = supabase();
  const userId = useStore.getState().userId;
  if (!sb || !userId || flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    useStore.getState().set({ syncStatus: "offline" });
    return;
  }
  flushing = true;
  useStore.getState().set({ syncStatus: "syncing" });
  try {
    const items = await pendingOutbox();
    for (const it of items) {
      const pk = PRIMARY_KEY[it.table];
      const res =
        it.op === "upsert"
          ? await sb.from(it.table).upsert({ ...it.row, user_id: userId }, { onConflict: conflictTarget(it.table) })
          : await sb.from(it.table).delete().eq(pk, it.key);
      if (res.error) {
        // Constraint errors would block the queue forever; log and drop them.
        console.warn(`sync ${it.op} ${it.table} failed`, res.error.message);
        if (!/fetch|network|timeout/i.test(res.error.message)) await ackOutbox([it.seq!]);
        else throw res.error;
      } else {
        await ackOutbox([it.seq!]);
      }
    }
    useStore.getState().set({ syncStatus: "synced" });
  } catch {
    useStore.getState().set({ syncStatus: "offline" });
  } finally {
    flushing = false;
  }
}

/** Pull every table for the signed-in user and merge with unsynced local rows. */
export async function pullAll(): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const remote = emptyTables() as unknown as Record<TableName, Record<string, unknown>[]>;
  for (const t of TABLE_NAMES) {
    const { data, error } = await sb.from(t).select("*").limit(50_000);
    if (error) throw error;
    remote[t] = (data ?? []).map(normaliseRow);
  }
  const local = getData();
  const remoteEmpty = TABLE_NAMES.every((t) => remote[t].length === 0);
  if (remoteEmpty && local.accounts.length) {
    // First sign-in on a device that already has local data: upload it all.
    await uploadAll(local);
    return;
  }
  // Re-apply pending local writes on top of the server copy.
  const pending = await pendingOutbox();
  const merged = applyChanges(remote as unknown as Tables, pending.map((p) => ({ table: p.table, op: p.op, row: p.row, key: p.key }) as Change));
  useStore.getState().replaceAll(merged);
}

async function uploadAll(local: Tables) {
  const sb = supabase();
  const userId = useStore.getState().userId;
  if (!sb || !userId) return;
  for (const t of ORDER) {
    const rows = (local[t] as unknown as Record<string, unknown>[]).map((r) => ({ ...r, user_id: userId }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from(t).upsert(rows.slice(i, i + 500), { onConflict: conflictTarget(t) });
      if (error) console.warn(`upload ${t} failed`, error.message);
    }
  }
}

/** numeric columns arrive as strings from PostgREST in some setups. */
function normaliseRow(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (SERVER_ONLY.has(k)) continue;
    out[k] = typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && NUMERIC_COLS.has(k) ? Number(v) : v;
  }
  return out;
}

const NUMERIC_COLS = new Set([
  "amount", "opening_balance", "credit_limit", "annual_fee", "fee_waiver_spend", "total_due", "min_due", "min_due_override",
  "amount_paid", "my_share", "share", "principal", "annual_rate", "processing_fee", "gst_pct", "amount_min", "amount_max",
  "escalation_pct", "deposit", "bid_price", "issue_price", "price_band_low", "price_band_high", "listing_price", "sell_price",
  "realised_pnl", "quantity", "avg_cost", "current_price", "target", "value", "salary", "buffer_pct", "stcg_rate", "ltcg_rate",
  "card_cap", "points_redeemed", "min_due_pct",
]);

export function startRealtime() {
  const sb = supabase();
  if (!sb || channel) return;
  channel = sb.channel("paisa-sync");
  for (const table of TABLE_NAMES) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
      const pk = PRIMARY_KEY[table];
      if (payload.eventType === "DELETE") {
        const key = (payload.old as Record<string, unknown>)[pk];
        if (key) useStore.getState().commit([{ table, op: "delete", key: String(key) }], { sync: false });
      } else {
        useStore.getState().commit([{ table, op: "upsert", row: normaliseRow(payload.new as Record<string, unknown>) }], { sync: false });
      }
    });
  }
  channel.subscribe();
}

export function stopRealtime() {
  channel?.unsubscribe();
  channel = null;
}

export function initSync() {
  setOnCommit(() => void flushOutbox());
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void flushOutbox());
    window.addEventListener("offline", () => useStore.getState().set({ syncStatus: "offline" }));
  }
}

export { ORDER as SYNC_ORDER };
