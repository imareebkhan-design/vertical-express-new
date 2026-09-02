import "server-only";
import { db } from "@/lib/db";
import { log } from "@/lib/observability";
import type { StockMovementReason } from "@/prisma/generated/client/client";

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

/** Reason codes a person may pick. `sold` and `returned` are written by the
 *  order path, never chosen in a form — offering them would let somebody
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
