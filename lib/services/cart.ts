import "server-only";
import { db } from "@/lib/db";

const FREE_DELIVERY_THRESHOLD_PAISE = 50000; // ₹500

export interface CartLine {
  itemId: string;
  variantId: string;
  productSlug: string;
  title: string;
  variantName: string;
  brandName: string;
  imageUrl: string | null;
  unitLabel: string;
  qty: number;
  basePricePaise: number;
  unitPricePaise: number; // tier-adjusted
  appliedTierMinQty: number | null;
  nextTier: { minQty: number; pricePaise: number } | null;
  lineTotalPaise: number;
  inStock: boolean;
}

export interface CartSummary {
  cartId: string | null;
  lines: CartLine[];
  count: number;
  subtotalPaise: number;
  freeDeliveryThresholdPaise: number;
  freeDeliveryRemainingPaise: number;
  qualifiesFreeDelivery: boolean;
}

const EMPTY: CartSummary = {
  cartId: null,
  lines: [],
  count: 0,
  subtotalPaise: 0,
  freeDeliveryThresholdPaise: FREE_DELIVERY_THRESHOLD_PAISE,
  freeDeliveryRemainingPaise: FREE_DELIVERY_THRESHOLD_PAISE,
  qualifiesFreeDelivery: false,
};

/** Resolve unit price for a quantity against the bulk-tier ladder. */
function tierPrice(
  basePaise: number,
  tiers: { minQty: number; pricePaise: number }[],
  qty: number
): { unitPaise: number; appliedMinQty: number | null; next: { minQty: number; pricePaise: number } | null } {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  const applied = [...sorted].reverse().find((t) => qty >= t.minQty) ?? null;
  const next = sorted.find((t) => qty < t.minQty) ?? null;
  return {
    unitPaise: applied?.pricePaise ?? basePaise,
    appliedMinQty: applied?.minQty ?? null,
    next,
  };
}

/** Find (or create) the cart for a user or guest anon id. */
export async function getOrCreateCart(userId: string | null, anonId: string | null) {
  if (userId) {
    return db.cart.upsert({ where: { userId }, update: {}, create: { userId } });
  }
  if (anonId) {
    return db.cart.upsert({ where: { anonId }, update: {}, create: { anonId } });
  }
  return null;
}

async function findCart(userId: string | null, anonId: string | null) {
  if (userId) return db.cart.findUnique({ where: { userId } });
  if (anonId) return db.cart.findUnique({ where: { anonId } });
  return null;
}

/** Full cart summary with live tier pricing, totals, and free-delivery meter. */
export async function getCartSummary(
  userId: string | null,
  anonId: string | null
): Promise<CartSummary> {
  const cart = await findCart(userId, anonId);
  if (!cart) return EMPTY;

  const items = await db.cartItem.findMany({
    where: { cartId: cart.id },
    orderBy: { createdAt: "asc" },
    include: {
      variant: {
        include: {
          bulkTiers: true,
          inventory: true,
          product: {
            include: {
              brand: { select: { name: true } },
              images: { where: { isPrimary: true }, take: 1 },
            },
          },
        },
      },
    },
  });

  const lines: CartLine[] = items.map((item) => {
    const v = item.variant;
    const { unitPaise, appliedMinQty, next } = tierPrice(
      v.pricePaise,
      v.bulkTiers.map((t) => ({ minQty: t.minQty, pricePaise: t.pricePaise })),
      item.qty
    );
    const available = v.inventory.reduce((sum, i) => sum + (i.qtyOnHand - i.qtyReserved), 0);
    return {
      itemId: item.id,
      variantId: v.id,
      productSlug: v.product.slug,
      title: v.product.title,
      variantName: v.name,
      brandName: v.product.brand.name,
      imageUrl: v.product.images[0]?.url ?? null,
      unitLabel: v.product.unitLabel,
      qty: item.qty,
      basePricePaise: v.pricePaise,
      unitPricePaise: unitPaise,
      appliedTierMinQty: appliedMinQty,
      nextTier: next,
      lineTotalPaise: unitPaise * item.qty,
      inStock: available > 0,
    };
  });

  const subtotalPaise = lines.reduce((sum, l) => sum + l.lineTotalPaise, 0);
  const count = lines.reduce((sum, l) => sum + l.qty, 0);
  const remaining = Math.max(0, FREE_DELIVERY_THRESHOLD_PAISE - subtotalPaise);

  return {
    cartId: cart.id,
    lines,
    count,
    subtotalPaise,
    freeDeliveryThresholdPaise: FREE_DELIVERY_THRESHOLD_PAISE,
    freeDeliveryRemainingPaise: remaining,
    qualifiesFreeDelivery: subtotalPaise >= FREE_DELIVERY_THRESHOLD_PAISE && subtotalPaise > 0,
  };
}

export async function addItem(
  userId: string | null,
  anonId: string | null,
  variantId: string,
  qty: number
) {
  const cart = await getOrCreateCart(userId, anonId);
  if (!cart) throw new Error("No cart context");

  // Guard: variant must exist and be active.
  const variant = await db.productVariant.findFirst({
    where: { id: variantId, isActive: true },
    select: { id: true },
  });
  if (!variant) throw new Error("Variant not found");

  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    update: { qty: { increment: qty } },
    create: { cartId: cart.id, variantId, qty },
  });
}

export async function updateItemQty(
  userId: string | null,
  anonId: string | null,
  itemId: string,
  qty: number
) {
  const cart = await findCart(userId, anonId);
  if (!cart) return;
  // Ownership check: item must belong to this cart.
  const item = await db.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
  if (!item) return;
  if (qty <= 0) {
    await db.cartItem.delete({ where: { id: itemId } });
  } else {
    await db.cartItem.update({ where: { id: itemId }, data: { qty: Math.min(999, qty) } });
  }
}

export async function removeItem(userId: string | null, anonId: string | null, itemId: string) {
  const cart = await findCart(userId, anonId);
  if (!cart) return;
  await db.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
}
