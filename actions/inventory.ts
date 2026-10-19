"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/services/admin/authz";
import {
  adjustStock,
  isOperatorReason,
  logAdjustment,
  OPERATOR_REASONS,
  recountStock,
} from "@/lib/services/inventory-movements";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * Adjusting stock from the console.
 *
 * Stock was readable here and changeable only with a database client. That is
 * the single most-used operation in a warehouse — a recount, a damaged bag, a
 * delivery arriving — and it was the one thing the console could not do.
 *
 * A reason is mandatory. A count that disagrees with the shelf is settled by
 * reading the reasons, and "adjusted" with nothing attached is the row that
 * starts an argument nobody can finish. A recount additionally needs a note:
 * it is the reason that most often means "the number was wrong and I do not
 * know why", and that sentence is worth having in the person's own words.
 *
 * `sold` and `returned` are not offered. Those are written by the order path,
 * and letting somebody pick them here would record a sale that never happened.
 */
const schema = z.object({
  variantId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  qtyDelta: z
    .number()
    .int("Stock moves in whole units")
    .refine((n) => n !== 0, "That would change nothing")
    .refine((n) => Math.abs(n) <= 100_000, "That is too large to be a correction"),
  reason: z.string().refine(isOperatorReason, `Pick one of: ${OPERATOR_REASONS.join(", ")}`),
  note: z.string().trim().max(200).optional(),
});

export async function adminAdjustStock(input: unknown): Promise<ActionResult<{ qtyAfter: number }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "That adjustment is not valid");
  }

  const { variantId, warehouseId, qtyDelta, reason, note } = parsed.data;

  if (reason === "recount" && !note) {
    return fail("VALIDATION", "A recount needs a note saying what you found");
  }

  const result = await adjustStock({
    variantId,
    warehouseId,
    qtyDelta,
    reason,
    note,
    actorEmail: admin.email,
  });

  logAdjustment(result, { variantId, warehouseId, qtyDelta, reason, actor: admin.email });

  if (!result.ok) {
    if (result.error === "not_found") return fail("NOT_FOUND", "No stock record at that warehouse");
    if (result.error === "would_go_negative") {
      return fail("VALIDATION", "That would take stock below zero");
    }
    /* Somebody else moved this count between the read and the write. Retrying
       silently would apply a delta computed against a number that no longer
       exists. */
    return fail("CONFLICT", "Somebody else changed this count. Reload and try again.");
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/stock-ledger");
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return succeed({ qtyAfter: result.qtyAfter });
}

const recountSchema = z.object({
  variantId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  countedQty: z
    .number()
    .int("Stock is counted in whole units")
    .min(0, "A shelf cannot hold fewer than zero")
    .max(1_000_000, "That is too large to be a shelf count"),
  /** The on-hand figure the operator was looking at when they counted. */
  expectedOnHand: z.number().int(),
  note: z.string().trim().min(1, "A recount needs a note saying what you found").max(200),
});

/**
 * Recording a shelf count: the number found, not a difference.
 *
 * Refused when the count moved after the operator read it (a sale between
 * counting and Apply) — the message gives the current figure, because only the
 * person holding the clipboard knows whether their count came before or after.
 */
export async function adminRecountStock(input: unknown): Promise<ActionResult<{ qtyAfter: number; qtyDelta: number }>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = recountSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "That count is not valid");
  }
  const { variantId, warehouseId, countedQty, expectedOnHand, note } = parsed.data;

  const result = await recountStock({ variantId, warehouseId, countedQty, expectedOnHand, note, actorEmail: admin.email });

  if (!result.ok) {
    logAdjustment({ ok: false, error: result.error === "stale" ? "raced" : result.error === "not_found" ? "not_found" : "would_go_negative" }, {
      variantId, warehouseId, countedQty, expectedOnHand, reason: "recount", actor: admin.email,
    });
    if (result.error === "not_found") return fail("NOT_FOUND", "No stock record at that warehouse");
    if (result.error === "stale") {
      return fail(
        "CONFLICT",
        `Stock changed while you were counting — it now says ${result.qtyOnHand}. Check whether your count was before or after that, then count again.`
      );
    }
    return fail("VALIDATION", "That count is not valid");
  }

  logAdjustment({ ok: true, qtyAfter: result.qtyAfter }, {
    variantId, warehouseId, countedQty, qtyDelta: result.qtyDelta, reason: "recount", actor: admin.email,
  });
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/stock-ledger");
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return succeed({ qtyAfter: result.qtyAfter, qtyDelta: result.qtyDelta });
}
