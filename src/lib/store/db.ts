// IndexedDB persistence (Dexie): a snapshot of all tables plus an outbox of
// pending writes that sync to Supabase when online.

import Dexie, { type Table } from "dexie";
import type { TableName } from "../types";

export interface OutboxItem {
  seq?: number;
  table: TableName;
  op: "upsert" | "delete";
  key: string;
  row?: Record<string, unknown>;
  at: string;
}

interface KV {
  key: string;
  value: unknown;
}

class PaisaDB extends Dexie {
  kv!: Table<KV, string>;
  outbox!: Table<OutboxItem, number>;
  constructor() {
    super("paisa-os");
    this.version(1).stores({ kv: "key", outbox: "++seq, table, key" });
  }
}

let _db: PaisaDB | null = null;
export function db(): PaisaDB | null {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  if (!_db) _db = new PaisaDB();
  return _db;
}

export async function loadSnapshot<T>(): Promise<T | null> {
  try {
    const row = await db()?.kv.get("tables");
    return (row?.value as T) ?? null;
  } catch {
    return null;
  }
}

export async function saveSnapshot(value: unknown): Promise<void> {
  try {
    await db()?.kv.put({ key: "tables", value });
  } catch (e) {
    console.warn("snapshot save failed", e);
  }
}

export async function enqueue(items: OutboxItem[]): Promise<void> {
  try {
    await db()?.outbox.bulkAdd(items);
  } catch (e) {
    console.warn("outbox add failed", e);
  }
}

export async function pendingOutbox(): Promise<OutboxItem[]> {
  try {
    return (await db()?.outbox.orderBy("seq").toArray()) ?? [];
  } catch {
    return [];
  }
}

export async function ackOutbox(seqs: number[]): Promise<void> {
  await db()?.outbox.bulkDelete(seqs);
}

export async function clearAll(): Promise<void> {
  await db()?.kv.clear();
  await db()?.outbox.clear();
}
