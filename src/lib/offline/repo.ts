import { db, newId, type Row, type SyncTable } from "./db";
import { enqueue, notifyLocalData } from "./sync";

type Ctx = { userId: string; shopId: string };

function nowIso() {
  return new Date().toISOString();
}

/* --------------------------------- reads ---------------------------------- */

export async function localProducts(): Promise<Row[]> {
  const rows = await db().products.toArray();
  return rows.sort((a, b) => String(a['name'] ?? "").localeCompare(String(b['name'] ?? "")));
}

export async function localSales(from?: Date, to?: Date): Promise<Row[]> {
  let rows = await db().sales.toArray();
  if (from) rows = rows.filter((r) => new Date(String(r['created_at'])) >= from);
  if (to) rows = rows.filter((r) => new Date(String(r['created_at'])) <= to);
  return rows.sort((a, b) => String(b['created_at']).localeCompare(String(a['created_at'])));
}

export async function localExpenses(from?: Date, to?: Date): Promise<Row[]> {
  let rows = await db().expenses.toArray();
  if (from) rows = rows.filter((r) => new Date(String(r['created_at'])) >= from);
  if (to) rows = rows.filter((r) => new Date(String(r['created_at'])) <= to);
  return rows.sort((a, b) => String(b['created_at']).localeCompare(String(a['created_at'])));
}

export async function localDebts(): Promise<Row[]> {
  const rows = await db().debts.toArray();
  return rows.sort((a, b) => {
    const paid = Number(!!a['is_paid']) - Number(!!b['is_paid']);
    if (paid !== 0) return paid;
    return String(b['created_at']).localeCompare(String(a['created_at']));
  });
}

/* -------------------------------- writes ---------------------------------- */

/** Insert a row locally (with a client generated uuid) and queue it for Supabase. */
export async function createRow(
  table: SyncTable,
  values: Record<string, unknown>,
  ctx: Ctx,
): Promise<Row> {
  const row: Row = {
    id: newId(),
    user_id: ctx.userId,
    shop_id: ctx.shopId,
    created_at: nowIso(),
    updated_at: nowIso(),
    ...values,
  } as Row;
  const payload: Record<string, unknown> = { ...row };
  if (table === "sales" || table === "expenses") delete payload['updated_at'];
  await db()[table].put(row);
  await enqueue({ table, type: "insert", rowId: row.id, payload, baseRow: null });
  return row;
}

export async function patchRow(table: SyncTable, id: string, patch: Record<string, unknown>) {
  const existing = await db()[table].get(id);
  const baseRow: Record<string, unknown> = {};
  for (const field of Object.keys(patch)) baseRow[field] = existing ? existing[field] : undefined;
  const next = { ...(existing ?? { id }), ...patch, updated_at: nowIso() } as Row;
  await db()[table].put(next);
  await enqueue({ table, type: "update", rowId: id, payload: patch, baseRow });
}

export async function removeRow(table: SyncTable, id: string) {
  await db()[table].delete(id);
  // drop queued ops that target a row that no longer exists locally
  const pending = await db().outbox.where("rowId").equals(id).toArray();
  const wasLocalOnly = pending.some((op) => op.type === "insert");
  await db().outbox.bulkDelete(pending.map((op) => op.seq as number));
  if (!wasLocalOnly) {
    await enqueue({ table, type: "delete", rowId: id, payload: {} });
  } else {
    notifyLocalData();
  }
}

/* ----------------------- domain helpers (stock mirror) --------------------- */

/** Mirrors the server trigger: a sale decrements the local stock. */
async function adjustLocalStock(productId: string | null | undefined, delta: number) {
  if (!productId) return;
  const p = await db().products.get(productId);
  if (!p) return;
  const current = Number(p['stock_qty'] ?? p['stock'] ?? 0);
  const stockQty = Math.max(Math.round((current + delta) * 1000) / 1000, 0);
  await db().products.put({ ...p, stock_qty: stockQty, stock: Math.ceil(stockQty) });
}

function saleQty(row: Record<string, unknown>) {
  return Number(row['quantity_qty'] ?? row['quantity'] ?? 0);
}

export type SaleInput = {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
};

export async function recordSales(items: SaleInput[], ctx: Ctx) {
  for (const item of items) {
    await createRow(
      "sales",
      {
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Math.max(1, Math.ceil(item.quantity)),
        quantity_qty: item.quantity,
        unit_price: item.unit_price,
        total: item.unit_price * item.quantity,
        is_cancelled: false,
        cancelled_at: null,
      },
      ctx,
    );
    await adjustLocalStock(item.product_id, -item.quantity);
  }
  notifyLocalData();
}

export async function setSaleCancelled(id: string, cancel: boolean) {
  const sale = await db().sales.get(id);
  await patchRow("sales", id, { is_cancelled: cancel, cancelled_at: cancel ? nowIso() : null });
  if (sale) {
    await adjustLocalStock(
      sale['product_id'] as string | null,
      (cancel ? 1 : -1) * saleQty(sale),
    );
  }
  notifyLocalData();
}

export async function deleteSale(id: string) {
  const sale = await db().sales.get(id);
  await removeRow("sales", id);
  if (sale && !sale['is_cancelled']) {
    await adjustLocalStock(sale['product_id'] as string | null, saleQty(sale));
  }
  notifyLocalData();
}
