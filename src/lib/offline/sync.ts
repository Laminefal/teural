import { supabase } from "@/integrations/supabase/client";
import { db, getMeta, isBrowser, newId, setMeta, type OutboxOp, type Row, type SyncTable } from "./db";

export type SyncState = {
  online: boolean;
  status: "online" | "offline" | "syncing" | "synced" | "error";
  pending: number;
  conflicts: number;
  lastSyncAt: string | null;
  lastError: string | null;
};

let state: SyncState = {
  online: true,
  status: "online",
  pending: 0,
  conflicts: 0,
  lastSyncAt: null,
  lastError: null,
};

const listeners = new Set<() => void>();

export function getSyncState() {
  return state;
}

export function subscribeSync(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Notified when local data changed so React Query can refetch from IndexedDB. */
const dataListeners = new Set<() => void>();
export function subscribeLocalData(cb: () => void) {
  dataListeners.add(cb);
  return () => dataListeners.delete(cb);
}
export function notifyLocalData() {
  dataListeners.forEach((l) => l());
}

export async function refreshCounters() {
  if (!isBrowser()) return;
  const [pending, conflicts] = await Promise.all([db().outbox.count(), db().conflicts.count()]);
  setState({ pending, conflicts });
}

export async function enqueue(op: Omit<OutboxOp, "opId" | "createdAt" | "tries">) {
  await db().outbox.add({
    ...op,
    opId: newId(),
    createdAt: new Date().toISOString(),
    tries: 0,
  } as OutboxOp);
  await refreshCounters();
  notifyLocalData();
  // fire & forget: sync right away when connection is available
  void requestSync();
}

/* -------------------------------------------------------------------------- */
/*                                   PUSH                                     */
/* -------------------------------------------------------------------------- */

async function pushOp(op: OutboxOp): Promise<void> {
  const table = op.table;

  if (op.type === "insert") {
    // idempotent: the row id is generated locally, duplicates are ignored
    const { error } = await supabase
      .from(table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(op.payload as any, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
    return;
  }

  if (op.type === "delete") {
    const { error } = await supabase.from(table).delete().eq("id", op.rowId);
    if (error) throw error;
    return;
  }

  // update — merge field by field, never silently overwrite a remote change
  const { data: serverRow, error: readErr } = await supabase
    .from(table)
    .select("*")
    .eq("id", op.rowId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!serverRow) return; // row deleted remotely → drop the op

  const server = serverRow as Record<string, unknown>;
  const base = op.baseRow ?? {};
  const patch: Record<string, unknown> = {};
  const conflicts: { field: string; localValue: unknown; serverValue: unknown }[] = [];

  for (const [field, localValue] of Object.entries(op.payload)) {
    if (field === "updated_at") continue;
    const hasBase = Object.prototype.hasOwnProperty.call(base, field);
    const serverChanged = hasBase && JSON.stringify(server[field]) !== JSON.stringify(base[field]);
    if (serverChanged && JSON.stringify(server[field]) !== JSON.stringify(localValue)) {
      conflicts.push({ field, localValue, serverValue: server[field] });
      continue; // keep the remote value, record the conflict
    }
    patch[field] = localValue;
  }

  if (conflicts.length) {
    await db().conflicts.bulkPut(
      conflicts.map((c) => ({
        id: newId(),
        table,
        rowId: op.rowId,
        field: c.field,
        localValue: c.localValue,
        serverValue: c.serverValue,
        at: new Date().toISOString(),
      })),
    );
  }

  if (Object.keys(patch).length) {
    if ("updated_at" in op.payload || table === "products" || table === "debts") {
      patch['updated_at'] = new Date().toISOString();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from(table).update(patch as any).eq("id", op.rowId);
    if (error) throw error;
  }
}

const MAX_TRIES = 5;

/**
 * Pushes queued operations in strict FIFO order (per row) so an insert always
 * lands before its update/delete. Operations that failed too many times are
 * skipped instead of blocking the whole queue forever.
 */
async function pushOutbox(): Promise<{ blocked: number; lastError: string | null }> {
  let blocked = 0;
  let lastError: string | null = null;
  const blockedRows = new Set<string>();

  const ops = await db().outbox.orderBy("seq").toArray();
  for (const op of ops) {
    if ((op.tries ?? 0) >= MAX_TRIES) {
      blocked += 1;
      lastError = op.lastError ?? lastError;
      blockedRows.add(`${op.table}:${op.rowId}`);
      continue;
    }
    // never reorder operations that target the same row
    if (blockedRows.has(`${op.table}:${op.rowId}`)) {
      blocked += 1;
      continue;
    }
    try {
      await pushOp(op);
      await db().outbox.delete(op.seq as number);
      await refreshCounters();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const tries = (op.tries ?? 0) + 1;
      await db().outbox.update(op.seq as number, { tries, lastError: message });
      lastError = message;
      blocked += 1;
      blockedRows.add(`${op.table}:${op.rowId}`);
      if (!navigator.onLine) break; // connection lost mid-sync: stop early
    }
  }

  return { blocked, lastError };
}

/* -------------------------------------------------------------------------- */
/*                                   PULL                                     */
/* -------------------------------------------------------------------------- */

async function pullTable(table: SyncTable, shopId: string, replace: boolean, since?: string) {
  let query = supabase.from(table).select("*").eq("shop_id", shopId);
  if (since) query = query.gte("created_at", since);
  const { data, error } = await query.limit(2000);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];
  const store = db()[table];
  if (replace) {
    const keep = new Set(rows.map((r) => r.id));
    const localIds = (await store.toCollection().primaryKeys()) as string[];
    const toDelete = localIds.filter((id) => !keep.has(id));
    if (toDelete.length) await store.bulkDelete(toDelete);
  }
  await store.bulkPut(rows);
}

export async function pullAll(shopId: string) {
  const since = new Date(Date.now() - 180 * 86400000).toISOString();
  await pullTable("products", shopId, true);
  await pullTable("debts", shopId, true);
  await pullTable("sales", shopId, false, since);
  await pullTable("expenses", shopId, false, since);
  await setMeta("lastPullAt", new Date().toISOString());
}

/* -------------------------------------------------------------------------- */
/*                                 ORCHESTRATION                              */
/* -------------------------------------------------------------------------- */

let syncing = false;
let currentShopId: string | null = null;

export function setSyncShop(shopId: string | null) {
  currentShopId = shopId;
  if (shopId) void setMeta("shopId", shopId);
}

export async function requestSync(opts?: { silent?: boolean }): Promise<void> {
  if (!isBrowser()) return;
  const shopId = currentShopId ?? (await getMeta<string>("shopId")) ?? null;
  if (!navigator.onLine) {
    setState({ online: false, status: "offline" });
    await refreshCounters();
    return;
  }
  if (syncing || !shopId) return;
  syncing = true;
  setState({ online: true, status: "syncing", lastError: null });
  try {
    // no valid session (expired token while offline) → keep everything queued
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      await refreshCounters();
      setState({ status: "online", lastError: null });
      return;
    }

    const { blocked, lastError } = await pushOutbox();
    const remaining = await db().outbox.count();
    // a blocked operation must never prevent reading fresh server data
    if (remaining === blocked) await pullAll(shopId);
    await refreshCounters();
    notifyLocalData();

    if (lastError) {
      setState({ status: navigator.onLine ? "error" : "offline", lastError });
      return;
    }

    const at = new Date().toISOString();
    setState({ status: "synced", lastSyncAt: at, lastError: null });
    if (!opts?.silent) {
      // back to a plain "online" badge shortly after
      setTimeout(() => {
        if (state.status === "synced") setState({ status: "online" });
      }, 2500);
    } else {
      setState({ status: "online" });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    setState({ status: navigator.onLine ? "error" : "offline", lastError: message });
    await refreshCounters();
  } finally {
    syncing = false;
  }
}

let started = false;

export function startSyncEngine() {
  if (!isBrowser() || started) return;
  started = true;
  setState({ online: navigator.onLine, status: navigator.onLine ? "online" : "offline" });

  window.addEventListener("online", () => {
    setState({ online: true });
    void requestSync();
  });
  window.addEventListener("offline", () => setState({ online: false, status: "offline" }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void requestSync({ silent: true });
  });
  window.setInterval(() => void requestSync({ silent: true }), 30000);
  void refreshCounters();
}
