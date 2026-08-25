import "server-only";
import { db } from "@/lib/db";
import type { CatalogItem } from "@/lib/services/catalog";

import { getAuthUserId } from "@/lib/supabase/server";

/** Wishlisted product-id set for the current user (empty for guests). */
export async function currentWishlistIdSet(): Promise<Set<string>> {
  const userId = await getAuthUserId();
  if (!userId) return new Set();
  const ids = await getWishlistProductIds(userId);
  return new Set(ids);
}

export async function getWishlistProductIds(userId: string): Promise<string[]> {
  const wl = await db.wishlist.findUnique({
    where: { userId },
    include: { items: { select: { productId: true } } },
  });
  return wl?.items.map((i) => i.productId) ?? [];
}

export async function toggleWishlist(userId: string, productId: string): Promise<boolean> {
  const wishlist = await db.wishlist.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  const existing = await db.wishlistItem.findUnique({
    where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
  });
  if (existing) {
    await db.wishlistItem.delete({ where: { id: existing.id } });
    return false;
  }
  await db.wishlistItem.create({ data: { wishlistId: wishlist.id, productId } });
  return true;
}

export async function getWishlistItems(userId: string): Promise<CatalogItem[]> {
  const wl = await db.wishlist.findUnique({
    where: { userId },
    include: {
      items: {
        orderBy: { createdAt: "desc" },
        include: {
          // productId references a Product; fetch via a follow-up for typed shape
        },
      },
    },
  });
  if (!wl || wl.items.length === 0) return [];

  const productIds = wl.items.map((i) => i.productId);
  const products = await db.product.findMany({
    where: { id: { in: productIds }, status: "published" },
    include: {
      brand: true,
      category: { select: { slug: true, isBulk: true } },
      images: { where: { isPrimary: true }, take: 1 },
      variants: {
        where: { isDefault: true },
        include: {
          bulkTiers: { select: { id: true }, take: 1 },
          inventory: { select: { qtyOnHand: true, qtyReserved: true } },
        },
      },
    },
  });

  return products
    .map((p): CatalogItem | null => {
      const variant = p.variants[0];
      if (!variant) return null;
      const available = variant.inventory?.reduce((sum, i) => sum + (i.qtyOnHand - i.qtyReserved), 0) ?? 0;
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        brandName: p.brand.name,
        categorySlug: p.category.slug,
        categoryIsBulk: p.category.isBulk,
        imageUrl: p.images[0]?.url ?? null,
        unitLabel: p.unitLabel,
        variantId: variant.id,
        pricePaise: variant.pricePaise,
        compareAtPaise: variant.compareAtPaise,
        hasBulkTiers: variant.bulkTiers.length > 0,
        ratingAvg: Number(p.ratingAvg),
        ratingCount: p.ratingCount,
        inStock: available > 0,
      };
    })
    .filter((x): x is CatalogItem => x !== null);
}
