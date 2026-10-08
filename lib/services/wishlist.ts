import "server-only";
import { db } from "@/lib/db";
import { toItem, type CatalogItem } from "@/lib/services/catalog";
import { VISIBLE_PRODUCT_STATUSES } from "@/lib/catalog-visibility";

import { getAuthUserId } from "@/lib/auth/current-user";

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
    where: { id: { in: productIds }, status: { in: [...VISIBLE_PRODUCT_STATUSES] } },
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

  return products.map(toItem).filter((x): x is CatalogItem => x !== null);
}
