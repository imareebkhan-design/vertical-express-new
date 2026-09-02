import "server-only";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import type { DeliverySpeed, ProductStatus } from "@prisma/client";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";

/**
 * Listing a product — putting a new thing on the shelf.
 *
 * The console could edit a product and not create one, so everything in the
 * catalogue arrived from a seed file. That is the difference between a shop
 * somebody runs and a demo somebody deployed.
 *
 * WHY THIS IS ONE TRANSACTION AND NOT THREE WRITES
 *
 * A product needs three rows before it is a real listing, and any two of them
 * without the third is a broken shelf entry that looks fine on the products
 * screen:
 *
 *   Product with no variant — nothing to add to a cart. The catalogue renders
 *   it and the buy button has nothing to point at.
 *
 *   Variant with no inventory row — reads as out of stock everywhere, forever,
 *   with no row to adjust. The inventory screen cannot even show it.
 *
 * So all three commit together or none does. The opening stock also writes a
 * StockMovement, because the stock ledger's whole promise is that every
 * quantity can be explained, and "it was there when I arrived" is not an
 * explanation.
 */
export interface NewProduct {
  title: string;
  slug: string;
  brandId: string;
  categoryId: string;
  description: string | null;
  unitLabel: string;
  deliverySpeed: DeliverySpeed | null;
  status: ProductStatus;
  variant: {
    name: string;
    sku: string;
    pricePaise: number;
    /** The struck-through price. Null when there is no discount to show. */
    compareAtPaise: number | null;
  };
  /** Optional opening stock. Zero is normal — stock usually arrives later. */
  openingStock: { warehouseId: string; qty: number } | null;
}

export type CreateResult =
  | { ok: true; slug: string }
  | { ok: false; error: "slug_taken" | "sku_taken" | "unknown" };

export async function createProduct(
  input: NewProduct,
  actor: { id: string; email: string }
): Promise<CreateResult> {
  try {
    const slug = await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          title: input.title,
          slug: input.slug,
          brandId: input.brandId,
          categoryId: input.categoryId,
          description: input.description,
          unitLabel: input.unitLabel,
          deliverySpeed: input.deliverySpeed,
          status: input.status,
        },
      });

      const variant = await tx.productVariant.create({
        data: {
          productId: product.id,
          name: input.variant.name,
          sku: input.variant.sku,
          pricePaise: input.variant.pricePaise,
          compareAtPaise: input.variant.compareAtPaise,
          isDefault: true,
          isActive: true,
        },
      });

      if (input.openingStock) {
        const { warehouseId, qty } = input.openingStock;
        await tx.inventory.create({
          data: { variantId: variant.id, warehouseId, qtyOnHand: qty },
        });

        /* Only when there is something to explain. An inventory row created at
           zero has no movement behind it, and inventing one would put a
           "received 0" in the ledger that never happened. */
        if (qty > 0) {
          await tx.stockMovement.create({
            data: {
              variantId: variant.id,
              warehouseId,
              qtyDelta: qty,
              qtyAfter: qty,
              reason: "received",
              note: "Opening stock when the product was listed",
              actorEmail: actor.email,
            },
          });
        }
      }

      await recordAudit(tx, {
        actorType: "admin",
        actorId: actor.id,
        action: "catalog.product_listed",
        entityType: "Product",
        entityId: product.id,
        before: null,
        after: {
          slug: product.slug,
          title: product.title,
          status: product.status,
          sku: variant.sku,
          pricePaise: variant.pricePaise,
          openingStock: input.openingStock?.qty ?? 0,
        },
      });

      return product.slug;
    });

    return { ok: true, slug };
  } catch (err) {
    /* Both slug and sku are unique, and telling somebody which one collided is
       the difference between a fixable message and a shrug. */
    const message = err instanceof Error ? err.message : "";
    if (message.includes("slug")) return { ok: false, error: "slug_taken" };
    if (message.includes("sku")) return { ok: false, error: "sku_taken" };
    return { ok: false, error: "unknown" };
  }
}

/** Everything the listing form needs to offer as a choice. */
export async function listingFormOptions() {
  const [brands, categories, warehouses] = await Promise.all([
    db.brand.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.category.findMany({
      where: { isActive: true },
      orderBy: [{ group: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, group: true, isBulk: true },
    }),
    db.warehouse.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, city: true },
    }),
  ]);
  /* The tax rate travels with the category so the form can show what will be
     charged without a client-side copy of the rate table. One source of truth;
     a copy would drift, and the screen where somebody sets a price is the worst
     place for a stale rate. */
  return {
    brands,
    warehouses,
    categories: categories.map((c) => {
      const tax = CATEGORY_TAX_CONFIGS[c.slug];
      return {
        ...c,
        hsn: tax?.hsn ?? null,
        gstRatePct: tax?.ratePct ?? null,
      };
    }),
  };
}
