import Dexie, { type Table } from "dexie";

export type SyncTable = "products" | "sales" | "expenses" | "debts";

export type Row = Record<string, unknown> & { id: string; shop_id?: string | null };

export type OutboxOp = {
  opId: string;
  seq?: number;
  table: SyncTable;
  type: "insert" | "update" | "delete";
  rowId: string;
  payload: Record<string, unknown>;
  /** snapshot of the row fields as they were locally before the update (conflict detection) */
  baseRow?: Record<string, unknown> | null;
  createdAt: string;
  tries: number;
  lastError?: string | null;
};

export type ConflictRecord = {
  id: string;
  table: SyncTable;
  rowId: string;
  field: string;
  localValue: unknown;
  serverValue: unknown;
  at: string;
};

export type MetaRow = { key: string; value: unknown };

class OfflineDB extends Dexie {
  products!: Table<Row, string>;
  sales!: Table<Row, string>;
  expenses!: Table<Row, string>;
  debts!: Table<Row, string>;
  outbox!: Table<OutboxOp, number>;
  conflicts!: Table<ConflictRecord, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("teural-offline");
    this.version(1).stores({
      products: "id, shop_id, name, updated_at",
      sales: "id, shop_id, created_at, product_id",
      expenses: "id, shop_id, created_at",
      debts: "id, shop_id, created_at, is_paid",
      outbox: "++seq, &opId, table, rowId",
      conflicts: "id, table, rowId, at",
      meta: "key",
    });
  }
}

let _db: OfflineDB | null = null;

/** Lazily created — never construct during SSR (no indexedDB there). */
export function db(): OfflineDB {
  if (typeof window === "undefined") {
    throw new Error("Le stockage local n'est disponible que dans le navigateur.");
  }
  if (!_db) _db = new OfflineDB();
  return _db;
}

export function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db().meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  await db().meta.put({ key, value });
}
