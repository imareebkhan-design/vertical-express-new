import "server-only";
import { db } from "@/lib/db";

const FREE_DELIVERY_THRESHOLD_PAISE = 50000; // ₹500

export interface CartLine {
  itemId: string;
  variantId: string;
  productSlug: string;
  categorySlug: string;
  /** Heavy material — decides which shipment the line travels in. */
  categoryIsBulk: boolean;
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
  adjusted?: boolean;
  adjustmentReason?: "limited" | "out_of_stock";
  availableStock?: number;
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

export interface UpdateCartQtyResult {
  summary: CartSummary;
  adjustment?: {
    status: "limited" | "out_of_stock";
    available: number;
    requested: number;
    message: string;
  };
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

/** Resolve active warehouse scoped to user address pincode or fallback. */
export async function resolveWarehouseId(userId: string | null): Promise<string> {
  if (userId) {
    const addr = await db.address.findFirst({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: { pincode: true },
    });
    if (addr) {
      const sp = await db.serviceablePincode.findFirst({
        where: { pincode: addr.pincode, isActive: true },
        select: { warehouseId: true },
      });
      if (sp) return sp.warehouseId;
    }
  }

  // Fallback to first available warehouse
  const fallback = await db.warehouse.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!fallback) throw new Error("No warehouses configured in system");
  return fallback.id;
}

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
              category: { select: { slug: true, isBulk: true } },
            },
          },
        },
      },
    },
  });

  const warehouseId = await resolveWarehouseId(userId);

  const lines: CartLine[] = [];
  for (const item of items) {
    const v = item.variant;
    
    // Look up warehouse-scoped inventory
    const inv = v.inventory.find((i) => i.warehouseId === warehouseId);
    const available = inv ? Math.max(0, inv.qtyOnHand - inv.qtyReserved) : 0;

    let lineQty = item.qty;
    let adjusted = false;
    let adjustmentReason: CartLine["adjustmentReason"] = undefined;

    if (available === 0) {
      if (item.qty !== 1) {
        await db.cartItem.update({ where: { id: item.id }, data: { qty: 1 } });
        lineQty = 1;
      }
      adjusted = true;
      adjustmentReason = "out_of_stock";
    } else if (item.qty > available) {
      await db.cartItem.update({ where: { id: item.id }, data: { qty: available } });
      lineQty = available;
      adjusted = true;
      adjustmentReason = "limited";
    }

    const { unitPaise, appliedMinQty, next } = tierPrice(
      v.pricePaise,
      v.bulkTiers.map((t) => ({ minQty: t.minQty, pricePaise: t.pricePaise })),
      lineQty
    );

    lines.push({
      itemId: item.id,
      variantId: v.id,
      productSlug: v.product.slug,
      categorySlug: v.product.category.slug,
      categoryIsBulk: v.product.category.isBulk,
      title: v.product.title,
      variantName: v.name,
      brandName: v.product.brand.name,
      imageUrl: v.product.images[0]?.url ?? null,
      unitLabel: v.product.unitLabel,
      qty: lineQty,
      basePricePaise: v.pricePaise,
      unitPricePaise: unitPaise,
      appliedTierMinQty: appliedMinQty,
      nextTier: next,
      lineTotalPaise: unitPaise * lineQty,
      inStock: available > 0,
      adjusted,
      adjustmentReason,
      availableStock: available,
    });
  }

  const subtotalPaise = lines.reduce((sum, l) => sum + (l.inStock ? l.lineTotalPaise : 0), 0);
  const count = lines.reduce((sum, l) => sum + (l.inStock ? l.qty : 0), 0);
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

  const warehouseId = await resolveWarehouseId(userId);
  const inv = await db.inventory.findUnique({
    where: { variantId_warehouseId: { variantId, warehouseId } },
  });
  const available = inv ? Math.max(0, inv.qtyOnHand - inv.qtyReserved) : 0;

  const existing = await db.cartItem.findFirst({
    where: { cartId: cart.id, variantId },
    select: { qty: true },
  });
  const currentQty = existing?.qty ?? 0;
  const requestedQty = currentQty + qty;

  if (available === 0) {
    throw new Error("OUT_OF_STOCK:This item is currently unavailable.");
  }

  if (requestedQty > available) {
    throw new Error(`ONLY_X_LEFT:Only ${available} items are available. Requested: ${requestedQty}`);
  }

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
): Promise<UpdateCartQtyResult> {
  const cart = await findCart(userId, anonId);
  if (!cart) return { summary: EMPTY };

  const item = await db.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
  });
  if (!item) return { summary: await getCartSummary(userId, anonId) };

  if (qty <= 0) {
    await db.cartItem.delete({ where: { id: itemId } });
    return { summary: await getCartSummary(userId, anonId) };
  }

  const warehouseId = await resolveWarehouseId(userId);
  const inv = await db.inventory.findUnique({
    where: { variantId_warehouseId: { variantId: item.variantId, warehouseId } },
  });
  const available = inv ? Math.max(0, inv.qtyOnHand - inv.qtyReserved) : 0;

  let adjustment: UpdateCartQtyResult["adjustment"] = undefined;

  if (available === 0) {
    await db.cartItem.update({ where: { id: itemId }, data: { qty: 1 } });
    adjustment = {
      status: "out_of_stock",
      available: 0,
      requested: qty,
      message: "This item is currently unavailable.",
    };
  } else if (qty > available) {
    await db.cartItem.update({ where: { id: itemId }, data: { qty: available } });
    adjustment = {
      status: "limited",
      available,
      requested: qty,
      message: `Only ${available} items are available.`,
    };
  } else {
    await db.cartItem.update({ where: { id: itemId }, data: { qty } });
  }

  return {
    summary: await getCartSummary(userId, anonId),
    adjustment,
  };
}

export async function removeItem(userId: string | null, anonId: string | null, itemId: string) {
  const cart = await findCart(userId, anonId);
  if (!cart) return;
  await db.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
}
