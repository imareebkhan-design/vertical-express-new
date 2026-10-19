import "server-only";
import { db } from "@/lib/db";
import { log } from "@/lib/observability";
import type { Prisma, StockMovementReason } from "@/prisma/generated/client/client";

/**
 * Changing stock, with a reason attached.
 *
 * WHY THIS EXISTS
 *
 * Stock was readable in the console and changeable only by someone with a
 * database client. The decrement at checkout was already race-free and
 * transactional, but it left no trace — 240 became 206 and nothing recorded
 * why or who. That is fine until the shelf disagrees with the screen, and then
 * there is nothing to read and the argument cannot be settled.
 *
 * So every change goes through here and writes a movement beside it, inside one
 * transaction. Either both happen or neither does; a movement that describes a
 * change that did not occur is worse than no history at all.
 *
 * THE GUARD
 *
 * `updateMany` with a `gte` condition, the same shape the order path uses. Two
 * operators counting the same shelf at the same time cannot drive stock
 * negative: the second update matches zero rows and the whole transaction is
 * rejected rather than silently applying to a number that has moved underneath
 * it.
 */
export type AdjustResult =
  | { ok: true; qtyAfter: number }
  | { ok: false; error: "not_found" | "would_go_negative" | "raced" };

export async function adjustStock(params: {
  variantId: string;
  warehouseId: string;
  /** Signed. Negative removes stock. */
  qtyDelta: number;
  reason: StockMovementReason;
  note?: string | null;
  actorEmail: string;
}): Promise<AdjustResult> {
  const { variantId, warehouseId, qtyDelta, reason, note, actorEmail } = params;

  if (qtyDelta === 0) return { ok: false, error: "would_go_negative" };

  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.inventory.findUnique({
        where: { variantId_warehouseId: { variantId, warehouseId } },
        select: { qtyOnHand: true },
      });
      if (!row) return { ok: false, error: "not_found" } as const;

      const qtyAfter = row.qtyOnHand + qtyDelta;
      if (qtyAfter < 0) return { ok: false, error: "would_go_negative" } as const;

      /* The guard. `qtyOnHand` must still be what we just read, or somebody
         else moved it between the read and the write and this delta was
         computed against a number that no longer exists. */
      const applied = await tx.inventory.updateMany({
        where: { variantId, warehouseId, qtyOnHand: row.qtyOnHand },
        data: { qtyOnHand: qtyAfter },
      });
      if (applied.count !== 1) return { ok: false, error: "raced" } as const;

      await tx.stockMovement.create({
        data: { variantId, warehouseId, qtyDelta, qtyAfter, reason, note: note ?? null, actorEmail },
      });

      return { ok: true, qtyAfter } as const;
    });
  } catch {
    return { ok: false, error: "raced" };
  }
}

export type RecountResult =
  | { ok: true; qtyAfter: number; qtyDelta: number }
  | { ok: false; error: "invalid" | "not_found" }
  /** The count moved since the operator read it. `qtyOnHand` is what it is now. */
  | { ok: false; error: "stale"; qtyOnHand: number };

/**
 * Record a shelf count: set on-hand to what was counted.
 *
 * `adjustStock` takes a delta, which is right for "+12 received" and "−3
 * damaged" — those are events. A recount is not an event, it is an
 * observation, and taking it as a delta made the operator do the subtraction
 * against the number on their screen. If a sale landed between the count and
 * Apply, the delta was applied to a count it was never computed against and
 * the figure recorded was silently not the one found.
 *
 * So the operator sends what they counted and the on-hand figure they were
 * looking at. If the record no longer says that, nothing is written and they
 * are told the current figure — stock moved while they counted, and only they
 * know whether their count was before or after it. The same compare-and-set
 * guard as `adjustStock` closes the gap between this read and the write.
 *
 * A count that matches the record writes a movement with a delta of zero. That
 * is information ("counted, agreed"), and it is how a row stocked before the
 * ledger existed gets its first history — from a person's count, not from an
 * inferred backfill.
 */
export async function recountStock(params: {
  variantId: string;
  warehouseId: string;
  countedQty: number;
  /** The on-hand figure the operator saw when they counted. */
  expectedOnHand: number;
  note: string;
  actorEmail: string;
}): Promise<RecountResult> {
  const { variantId, warehouseId, countedQty, expectedOnHand, note, actorEmail } = params;
  if (!Number.isInteger(countedQty) || countedQty < 0 || !Number.isInteger(expectedOnHand)) {
    return { ok: false, error: "invalid" };
  }

  return db.$transaction(async (tx) => {
    const row = await tx.inventory.findUnique({
      where: { variantId_warehouseId: { variantId, warehouseId } },
      select: { qtyOnHand: true },
    });
    if (!row) return { ok: false, error: "not_found" } as const;
    if (row.qtyOnHand !== expectedOnHand) return { ok: false, error: "stale", qtyOnHand: row.qtyOnHand } as const;

    const qtyDelta = countedQty - row.qtyOnHand;
    /* The guard, and for a matching count the row lock: an update to the same
       value still locks the row, so no change can commit between this check
       and the movement — a "counted, agreed" row must not describe a number
       that was already gone. */
    const applied = await tx.inventory.updateMany({
      where: { variantId, warehouseId, qtyOnHand: row.qtyOnHand },
      data: { qtyOnHand: countedQty },
    });
    if (applied.count !== 1) {
      const now = await tx.inventory.findUnique({
        where: { variantId_warehouseId: { variantId, warehouseId } },
        select: { qtyOnHand: true },
      });
      return { ok: false, error: "stale", qtyOnHand: now?.qtyOnHand ?? row.qtyOnHand } as const;
    }

    await tx.stockMovement.create({
      data: { variantId, warehouseId, qtyDelta, qtyAfter: countedQty, reason: "recount", note, actorEmail },
    });
    return { ok: true, qtyAfter: countedQty, qtyDelta } as const;
  });
}

/**
 * The ledger row for a stock change the system has just made inside `tx`.
 *
 * Checkout's decrement and the cancel paths' restock change `qtyOnHand`
 * directly — those writes are the proven, race-free part and are left exactly
 * as they were. This only writes the row that explains them, in the same
 * transaction, so a sale or a release can no longer happen without a trace.
 *
 * `qtyAfter` is read back after the caller's write. That read is exact: the
 * caller's update holds the row lock until the transaction commits, so no other
 * writer can move the count between the write and this read.
 *
 * A missing row throws rather than skipping. The caller has just updated that
 * row, so a miss means the caller is wrong, and the transaction should not
 * commit a stock change the ledger cannot describe.
 */
export async function recordSystemMovement(
  tx: Prisma.TransactionClient,
  m: {
    variantId: string;
    warehouseId: string;
    /** Signed, as applied by the caller. */
    qtyDelta: number;
    reason: "sold" | "released";
    orderId: string;
    note?: string | null;
  }
): Promise<void> {
  const row = await tx.inventory.findUnique({
    where: { variantId_warehouseId: { variantId: m.variantId, warehouseId: m.warehouseId } },
    select: { qtyOnHand: true },
  });
  if (!row) throw new Error(`STOCK_LEDGER_ROW_MISSING:${m.variantId}@${m.warehouseId}`);
  await tx.stockMovement.create({
    data: {
      variantId: m.variantId,
      warehouseId: m.warehouseId,
      qtyDelta: m.qtyDelta,
      qtyAfter: row.qtyOnHand,
      reason: m.reason,
      note: m.note ?? null,
      actorEmail: null,
      orderId: m.orderId,
    },
  });
}

export type UnresolvedRestockCause = "no_warehouse" | "no_inventory_row";

const UNRESOLVED_RESTOCK = "inventory.restock_unresolved";

/**
 * Record, inside the cancel's transaction, goods a cancel could not put back.
 *
 * The cancel path refuses to guess a warehouse or invent a stock row (see
 * `restock` in orders.ts), which is right, but leaves the goods unaccounted
 * for. A log line is not enough: the order is now cancelled, a second cancel is
 * refused, so nothing will retry it. This row is the durable trace, and it
 * commits or rolls back with the cancel.
 */
export async function recordUnresolvedRestock(
  tx: Prisma.TransactionClient,
  r: { orderId: string; variantId: string; warehouseId: string | null; qty: number; cause: UnresolvedRestockCause }
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorType: "system",
      action: UNRESOLVED_RESTOCK,
      entityType: "order",
      entityId: r.orderId,
      after: { variantId: r.variantId, warehouseId: r.warehouseId, qty: r.qty, cause: r.cause },
    },
  });
}

export interface UnresolvedRestockRow {
  orderId: string;
  orderNo: string | null;
  variantId: string;
  sku: string | null;
  productTitle: string | null;
  productSlug: string | null;
  warehouseId: string | null;
  qty: number;
  cause: UnresolvedRestockCause;
  at: Date;
}

/**
 * Cancelled goods that were not restocked, newest first.
 *
 * Read-only. This lists them; it does not decide where they belong. Settling
 * one is an operator's recount (or receipt) at the warehouse where the goods
 * actually are, with a note naming the order — the same auditable path as any
 * other correction. There is deliberately no "resolved" flag yet: marking a
 * row settled is a business workflow nobody has specified.
 */
export async function listUnresolvedRestocks(take = 20): Promise<UnresolvedRestockRow[]> {
  const rows = await db.auditLog.findMany({
    where: { action: UNRESOLVED_RESTOCK, entityType: "order" },
    orderBy: { createdAt: "desc" },
    take,
    select: { entityId: true, after: true, createdAt: true },
  });
  const parsed = rows.flatMap((r) => {
    const a = r.after as { variantId?: unknown; warehouseId?: unknown; qty?: unknown; cause?: unknown } | null;
    if (!a || typeof a.variantId !== "string" || typeof a.qty !== "number") return [];
    const cause: UnresolvedRestockCause = a.cause === "no_warehouse" ? "no_warehouse" : "no_inventory_row";
    return [{
      orderId: r.entityId,
      variantId: a.variantId,
      warehouseId: typeof a.warehouseId === "string" ? a.warehouseId : null,
      qty: a.qty,
      cause,
      at: r.createdAt,
    }];
  });
  const [orders, variants] = await Promise.all([
    db.order.findMany({ where: { id: { in: parsed.map((p) => p.orderId) } }, select: { id: true, orderNo: true } }),
    db.productVariant.findMany({
      where: { id: { in: parsed.map((p) => p.variantId) } },
      select: { id: true, sku: true, product: { select: { title: true, slug: true } } },
    }),
  ]);
  const orderNo = new Map(orders.map((o) => [o.id, o.orderNo]));
  const variant = new Map(variants.map((v) => [v.id, v]));
  return parsed.map((p) => ({
    ...p,
    orderNo: orderNo.get(p.orderId) ?? null,
    sku: variant.get(p.variantId)?.sku ?? null,
    productTitle: variant.get(p.variantId)?.product.title ?? null,
    productSlug: variant.get(p.variantId)?.product.slug ?? null,
  }));
}

export interface LedgerDriftRow {
  variantId: string;
  warehouseId: string;
  sku: string;
  productTitle: string;
  productSlug: string;
  warehouseName: string;
  qtyOnHand: number;
  /** `qtyAfter` of the newest movement — what the ledger says should be there. */
  ledgerQty: number;
}

/**
 * Stock counts the ledger cannot explain.
 *
 * Every movement stores `qtyAfter`, so the newest movement for a variant at a
 * warehouse says what the count should be now. Where `qtyOnHand` disagrees,
 * something changed the count without writing a movement — a script, a
 * database client, or a code path that predates this ledger. Those are the rows
 * to recount; this lists them and changes nothing.
 *
 * Rows with stock but no movement at all are counted separately and not listed
 * as drift: their opening balance was set before the ledger existed, which is
 * a known gap, not evidence of a fault. Recording an opening balance for them is
 * an operator's recount, not something to infer.
 *
 * Ties on `created_at` are broken by id, which is arbitrary but stable. Two
 * movements for the same variant at the same warehouse in the same microsecond
 * would have to come from one transaction, and none of the writers do that.
 */
export async function findLedgerDrift(limit = 100): Promise<{
  rows: LedgerDriftRow[];
  driftCount: number;
  /** Inventory rows holding stock that the ledger has never seen. */
  unledgeredCount: number;
}> {
  const [rows, counts] = await Promise.all([
    db.$queryRaw<
      {
        variant_id: string;
        warehouse_id: string;
        sku: string;
        title: string;
        slug: string;
        warehouse_name: string;
        qty_on_hand: number;
        ledger_qty: number;
      }[]
    >`
      SELECT i.variant_id, i.warehouse_id, v.sku, p.title, p.slug, w.name AS warehouse_name,
             i.qty_on_hand, last.qty_after AS ledger_qty
      FROM inventory i
      JOIN LATERAL (
        SELECT m.qty_after FROM stock_movements m
        WHERE m.variant_id = i.variant_id AND m.warehouse_id = i.warehouse_id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      ) last ON true
      JOIN product_variants v ON v.id = i.variant_id
      JOIN products p ON p.id = v.product_id
      JOIN warehouses w ON w.id = i.warehouse_id
      WHERE last.qty_after <> i.qty_on_hand
      ORDER BY abs(i.qty_on_hand - last.qty_after) DESC, v.sku
      LIMIT ${limit}
    `,
    db.$queryRaw<{ drift: bigint; unledgered: bigint }[]>`
      SELECT
        count(*) FILTER (WHERE last.qty_after IS NOT NULL AND last.qty_after <> i.qty_on_hand) AS drift,
        count(*) FILTER (WHERE last.qty_after IS NULL AND i.qty_on_hand <> 0) AS unledgered
      FROM inventory i
      LEFT JOIN LATERAL (
        SELECT m.qty_after FROM stock_movements m
        WHERE m.variant_id = i.variant_id AND m.warehouse_id = i.warehouse_id
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 1
      ) last ON true
    `,
  ]);
  return {
    rows: rows.map((r) => ({
      variantId: r.variant_id,
      warehouseId: r.warehouse_id,
      sku: r.sku,
      productTitle: r.title,
      productSlug: r.slug,
      warehouseName: r.warehouse_name,
      qtyOnHand: r.qty_on_hand,
      ledgerQty: r.ledger_qty,
    })),
    driftCount: Number(counts[0]?.drift ?? 0),
    unledgeredCount: Number(counts[0]?.unledgered ?? 0),
  };
}

/**
 * The stock ledger — every movement, newest first.
 *
 * Reads `qtyAfter` from the row rather than replaying the history. That is
 * deliberate: a ledger page has to be readable without walking every prior
 * movement, and storing both means a divergence between the running total and
 * the stored one is itself detectable rather than invisible.
 */
export async function listStockMovements(page = 1, perPage = 50) {
  const [rows, total] = await Promise.all([
    db.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        qtyDelta: true,
        qtyAfter: true,
        reason: true,
        note: true,
        actorEmail: true,
        createdAt: true,
        warehouse: { select: { name: true } },
        variant: {
          select: { sku: true, name: true, product: { select: { title: true, slug: true } } },
        },
      },
    }),
    db.stockMovement.count(),
  ]);
  return { rows, total, page, perPage };
}

/** Movements for one variant at one warehouse, for the product editor. */
export async function listMovementsForVariant(variantId: string, take = 10) {
  return db.stockMovement.findMany({
    where: { variantId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      qtyDelta: true,
      qtyAfter: true,
      reason: true,
      note: true,
      actorEmail: true,
      createdAt: true,
      warehouse: { select: { name: true } },
    },
  });
}

/** Reason codes a person may pick. `sold`, `released` and `returned` are
 *  written by the order path, never chosen in a form — offering them would let somebody
 *  record a sale that did not happen. */
export const OPERATOR_REASONS = [
  "recount",
  "received",
  "damaged",
  "lost",
  "transfer",
  "correction",
] as const;

export function isOperatorReason(v: string): v is (typeof OPERATOR_REASONS)[number] {
  return (OPERATOR_REASONS as readonly string[]).includes(v);
}

export function logAdjustment(r: AdjustResult, meta: Record<string, unknown>) {
  log(r.ok ? "INFO" : "WARN", {
    service: "inventory",
    event: r.ok ? "stock_adjusted" : "stock_adjust_rejected",
    metadata: { ...meta, ...(r.ok ? { qtyAfter: r.qtyAfter } : { reason: r.error }) },
  });
}
