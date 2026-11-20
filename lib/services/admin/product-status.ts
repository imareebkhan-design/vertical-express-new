import "server-only";
import type { ProductStatus } from "@/prisma/generated/client/client";
import { db } from "@/lib/db";
import { recordAudit, type DbClient } from "@/lib/services/audit";
import { catalogOnlyReason, sellableReasons, unpublishableReason } from "./publish-guard";

/**
 * The product status gate, in one place.
 *
 * It was written inline in `adminSaveProduct`, and only a move INTO published
 * left an audit row: hiding a product (to draft or archived) or demoting it to
 * catalogue-only went to the application log only, so "who hid this, and
 * when" had no answer in the database. Every change of status is now audited
 * in the transaction that makes it. The gate itself is unchanged.
 */

export class StatusGateRefused extends Error {
  constructor(readonly reasons: string[]) {
    super(reasons.join("; "));
    this.name = "StatusGateRefused";
  }
}

type Actor = { id: string | null; email: string };

/**
 * Call inside the transaction that wrote `to`, with the product row locked and
 * `from` read under that lock. Checks the state the write produced, so a
 * refusal (thrown) rolls the write back. Audits any actual change.
 */
export async function gateAndAuditStatus(
  tx: DbClient,
  change: { productId: string; from: ProductStatus; to: ProductStatus; actor: Actor },
): Promise<void> {
  const { productId, from, to, actor } = change;
  if (to === "published" && from !== "published") {
    const reasons = await sellableReasons(tx, productId);
    if (reasons.length) throw new StatusGateRefused(reasons);
  } else if (to === "published") {
    // Already published products must still satisfy the gate on every save.
    const why = await unpublishableReason(tx, productId);
    if (why) throw new StatusGateRefused([why]);
  } else if (to === "catalog_only") {
    const why = await catalogOnlyReason(tx, productId);
    if (why) throw new StatusGateRefused([why]);
  }
  if (from === to) return;
  await recordAudit(tx, {
    actorType: "admin",
    actorId: actor.id,
    // The publish action keeps its existing name; every other move shares one.
    action: to === "published" ? "catalogue.product_published" : "catalogue.product_status_changed",
    entityType: "product",
    entityId: productId,
    before: { status: from },
    after: { status: to, by: actor.email },
  });
}

export type SetStatusResult =
  | { ok: true; changed: boolean; slug: string }
  | { ok: false; code: "NOT_FOUND" }
  | { ok: false; code: "GATE_REFUSED"; reasons: string[] };

/** Change only a product's status, gated and audited. For callers that edit nothing else. */
export async function setProductStatus(productId: string, to: ProductStatus, actor: Actor): Promise<SetStatusResult> {
  try {
    return await db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ slug: string; status: ProductStatus }[]>`
        SELECT slug, status FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
      if (!row) return { ok: false as const, code: "NOT_FOUND" as const };
      if (row.status !== to) await tx.product.update({ where: { id: productId }, data: { status: to } });
      await gateAndAuditStatus(tx, { productId, from: row.status, to, actor });
      return { ok: true as const, changed: row.status !== to, slug: row.slug };
    });
  } catch (e) {
    if (e instanceof StatusGateRefused) return { ok: false, code: "GATE_REFUSED", reasons: e.reasons };
    throw e;
  }
}
