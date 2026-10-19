"use client";

// Local-first store. Every write is applied optimistically to in-memory state,
// persisted to IndexedDB, and queued in the outbox for Supabase sync.

import { create } from "zustand";
import { PRIMARY_KEY, TABLE_NAMES, type TableName, type Tables } from "../types";
import { enqueue, loadSnapshot, saveSnapshot, type OutboxItem } from "./db";

export const emptyTables = (): Tables =>
  Object.fromEntries(TABLE_NAMES.map((t) => [t, []])) as unknown as Tables;

export type Row<T extends TableName> = Tables[T][number];

export interface Change {
  table: TableName;
  op: "upsert" | "delete";
  row?: Record<string, unknown>;
  key?: string;
}

export interface Toast {
  id: string;
  text: string;
  action?: { label: string; run: () => void };
  ttl: number;
}

interface State {
  data: Tables;
  hydrated: boolean;
  syncStatus: "local" | "synced" | "syncing" | "offline" | "error";
  userId: string | null;
  email: string | null;
  locked: boolean;
  toasts: Toast[];
  quickAdd: { open: boolean; text?: string; mode?: string };
  hydrate: () => Promise<void>;
  commit: (changes: Change[], opts?: { sync?: boolean }) => void;
  replaceAll: (data: Tables) => void;
  toast: (t: Omit<Toast, "id" | "ttl"> & { ttl?: number }) => void;
  dismissToast: (id: string) => void;
  setQuickAdd: (q: State["quickAdd"]) => void;
  set: (p: Partial<Pick<State, "syncStatus" | "userId" | "email" | "locked">>) => void;
}

// Writes go to IndexedDB immediately (closing the app right after saving must
// not lose data); while one write is in flight, only the latest state is queued.
let saving = false;
let pendingSave: Tables | null = null;
function scheduleSave(data: Tables) {
  pendingSave = data;
  if (!saving) void flushSave();
}
async function flushSave() {
  saving = true;
  while (pendingSave) {
    const d = pendingSave;
    pendingSave = null;
    await saveSnapshot(d);
  }
  saving = false;
}

export const keyOf = (table: TableName, row: Record<string, unknown>) => String(row[PRIMARY_KEY[table]]);

export function applyChanges(data: Tables, changes: Change[]): Tables {
  const next = { ...data } as unknown as Record<TableName, Record<string, unknown>[]>;
  for (const c of changes) {
    const pk = PRIMARY_KEY[c.table];
    const list = [...(next[c.table] ?? [])];
    if (c.op === "upsert" && c.row) {
      const k = c.row[pk];
      const i = list.findIndex((r) => r[pk] === k);
      if (i >= 0) list[i] = { ...list[i], ...c.row };
      else list.push(c.row);
    } else if (c.op === "delete") {
      const k = c.key ?? (c.row ? c.row[pk] : undefined);
      const i = list.findIndex((r) => r[pk] === k);
      if (i >= 0) list.splice(i, 1);
    }
    next[c.table] = list;
  }
  return next as unknown as Tables;
}

/** Hook for the sync layer to flush after local commits. */
let onCommit: (() => void) | null = null;
export const setOnCommit = (fn: () => void) => (onCommit = fn);

export const useStore = create<State>((set, get) => ({
  data: emptyTables(),
  hydrated: false,
  syncStatus: "local",
  userId: null,
  email: null,
  locked: false,
  toasts: [],
  quickAdd: { open: false },

  hydrate: async () => {
    const snap = await loadSnapshot<Partial<Tables>>();
    const data = { ...emptyTables(), ...(snap ?? {}) } as Tables;
    set({ data, hydrated: true });
  },

  commit: (changes, opts = {}) => {
    if (!changes.length) return;
    const data = applyChanges(get().data, changes);
    set({ data });
    scheduleSave(data);
    if (opts.sync !== false) {
      const at = new Date().toISOString();
      const items: OutboxItem[] = changes.map((c) => {
        const row = c.op === "upsert" ? (data[c.table] as unknown as Record<string, unknown>[]).find((r) => keyOf(c.table, r) === keyOf(c.table, c.row!)) : undefined;
        return { table: c.table, op: c.op, key: c.key ?? keyOf(c.table, c.row!), row, at };
      });
      enqueue(items).then(() => onCommit?.());
    }
  },

  replaceAll: (data) => {
    set({ data });
    scheduleSave(data);
  },

  toast: (t) => {
    const id = Math.random().toString(36).slice(2);
    const ttl = t.ttl ?? (t.action ? 10_000 : 3_000);
    set({ toasts: [...get().toasts, { ...t, id, ttl }] });
    setTimeout(() => get().dismissToast(id), ttl);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
  setQuickAdd: (quickAdd) => set({ quickAdd }),
  set: (p) => set(p),
}));

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

export const nowIso = () => new Date().toISOString();

export const getData = () => useStore.getState().data;
