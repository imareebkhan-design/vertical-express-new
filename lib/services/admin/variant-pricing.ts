import "server-only";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";

/**
 * Changing a variant's selling price and MRP from the console — ISS-068.
 *
 * Until this existed a price could be set once, at listing, and never again:
 * the only way to reprice was to delete the product and list it afresh, losing
 * its slug and history, or to edit the database by hand.
 *
 * What a price change does and does not touch:
 *  - Orders already placed keep the price they were placed at. Every order line
 *    carries its own `unitPricePaise` snapshot; nothing here reads or writes it.
 *  - Carts store no price (they resolve it on read), so an open cart shows the
 *    new price the next time it is read. A checkout already showing the old
 *    total cannot be placed at the new one: placement refuses a total the
 *    customer was not shown (TOTAL_CHANGED, web and native).
 *
 * Two operators editing the same variant: the form sends the price it showed,
 * and the write only lands if that is still the stored price. Otherwise the
 * change is refused and nothing is written — the second operator re-reads
 * rather than silently overwriting the first.
 *
 * The audit row is written in the same transaction as the price, so a price
 * cannot change without the record of who changed it from what.
 */

/** The `price_paise` column is a 32-bit integer — a storage limit, not a policy. */
export const MAX_STORED_PAISE = 2_147_483_647;

export interface VariantPriceChange {
  variantId: string;
  pricePaise: number;
  /** Null clears the MRP (no struck-through price). */
  compareAtPaise: number | null;
  /** What the operator's screen showed — the change applies only if it is still current. */
  expected: { pricePaise: number; compareAtPaise: number | null };
}

export type VariantPriceResult =
  | { ok: true; changed: boolean; productSlug: string }
  | { ok: false; reason: "invalid"; message: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "stale" };

type Audit = typeof recordAudit;

/** Pure: the same rules the listing form applies, plus the column's limit. */
export function priceProblem(pricePaise: number, compareAtPaise: number | null): string | null {
  if (!Number.isSafeInteger(pricePaise)) return "The selling price is not a rupee amount";
  if (pricePaise <= 0) return "The selling price must be more than zero";
  if (pricePaise > MAX_STORED_PAISE) return "The selling price is too large to store";
  if (compareAtPaise !== null) {
    if (!Number.isSafeInteger(compareAtPaise)) return "The MRP is not a rupee amount";
    if (compareAtPaise > MAX_STORED_PAISE) return "The MRP is too large to store";
    if (compareAtPaise <= pricePaise) return "The MRP must be above the selling price, or left blank";
  }
  return null;
}

export async function setVariantPrice(
  change: VariantPriceChange,
  actor: { id: string },
  audit: Audit = recordAudit
): Promise<VariantPriceResult> {
  const problem = priceProblem(change.pricePaise, change.compareAtPaise);
  if (problem) return { ok: false, reason: "invalid", message: problem };

  return db.$transaction(async (tx) => {
    const current = await tx.productVariant.findUnique({
      where: { id: change.variantId },
      select: { pricePaise: true, compareAtPaise: true, product: { select: { slug: true } } },
    });
    if (!current) return { ok: false, reason: "not_found" } as const;

    const productSlug = current.product.slug;
    if (current.pricePaise === change.pricePaise && current.compareAtPaise === change.compareAtPaise) {
      return { ok: true, changed: false, productSlug } as const;
    }

    /* Compare-and-set: lands only if the stored values are still the ones the
       operator saw. Atomic in the database, so two concurrent saves cannot both
       succeed from the same starting price. */
    const written = await tx.productVariant.updateMany({
      where: {
        id: change.variantId,
        pricePaise: change.expected.pricePaise,
        compareAtPaise: change.expected.compareAtPaise,
      },
      data: { pricePaise: change.pricePaise, compareAtPaise: change.compareAtPaise },
    });
    if (written.count !== 1) return { ok: false, reason: "stale" } as const;

    await audit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: "variant.price_changed",
      entityType: "product_variant",
      entityId: change.variantId,
      before: { pricePaise: current.pricePaise, compareAtPaise: current.compareAtPaise },
      after: { pricePaise: change.pricePaise, compareAtPaise: change.compareAtPaise },
    });

    return { ok: true, changed: true, productSlug } as const;
  });
}
