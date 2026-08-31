import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db";
import { mostOrderedInCategory } from "@/lib/services/catalog";

/**
 * "Most ordered in <category>" — the section the app canvas asks for.
 *
 * The existing `popular` sort could not back it. It is `ratingCount desc`, there
 * is no Review model, nothing writes the column, and every product in the
 * catalogue sits at zero — so the storefront's default ordering silently falls
 * through to `createdAt desc`. Newest-first by accident, presented as
 * popularity.
 *
 * This ranks by summed OrderItem quantity, which is what "most ordered"
 * literally means. The two things worth pinning are the ranking itself and what
 * it refuses to count: an order abandoned at payment or cancelled at the gate is
 * not evidence anybody wanted the product.
 */
const made: { orders: string[]; users: string[] } = { orders: [], users: [] };

let categorySlug = "";
let variantA = "";
let variantB = "";

test.before(async () => {
  const cat = await db.category.findFirst({
    where: { products: { some: { status: "published", variants: { some: {} } } } },
    select: { slug: true, id: true },
  });
  assert.ok(cat, "the seeded catalogue needs at least one category with products");
  categorySlug = cat.slug;

  const products = await db.product.findMany({
    where: { categoryId: cat.id, status: "published", variants: { some: {} } },
    select: { variants: { select: { id: true }, take: 1 } },
    take: 2,
  });
  assert.ok(products.length >= 2, "need two products in one category to rank them");
  variantA = products[0].variants[0].id;
  variantB = products[1].variants[0].id;
});

async function placeOrder(status: "delivered" | "cancelled" | "pending_payment", items: { variantId: string; qty: number }[]) {
  const user = await db.user.create({
    data: { id: randomUUID(), phone: `+9199${Math.floor(10000000 + Math.random() * 89999999)}` },
    select: { id: true },
  });
  made.users.push(user.id);

  const order = await db.order.create({
    data: {
      orderNo: `MO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: user.id,
      status,
      subtotalPaise: 1000, taxPaise: 0, deliveryFeePaise: 0, discountPaise: 0, totalPaise: 1000,
      paymentMethod: "cod",
      address: { name: "Site", phone: "9876543210", line1: "Plot 1", city: "Srinagar", state: "Jammu & Kashmir", pincode: "190001" },
      items: {
        create: items.map((i) => ({
          variantId: i.variantId,
          title: "Test line",
          variantName: "default",
          unitPricePaise: 1000,
          qty: i.qty,
          lineTotalPaise: 1000 * i.qty,
        })),
      },
    },
    select: { id: true },
  });
  made.orders.push(order.id);
}

test.after(async () => {
  await db.order.deleteMany({ where: { id: { in: made.orders } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } });
});

test("with nothing ordered, the section has nothing to show", async () => {
  /* The honest early answer. Filling the space with whatever was seeded first
     is what the ratingCount sort was already doing. */
  const items = await mostOrderedInCategory(categorySlug);
  assert.deepEqual(items, []);
});

test("ranks by quantity actually ordered", async () => {
  await placeOrder("delivered", [{ variantId: variantB, qty: 2 }]);
  await placeOrder("delivered", [{ variantId: variantA, qty: 9 }]);

  const items = await mostOrderedInCategory(categorySlug);
  assert.ok(items.length >= 2, "both products should appear");

  const ids = items.map((i) => i.id);
  const [pa, pb] = await Promise.all([
    db.productVariant.findUnique({ where: { id: variantA }, select: { productId: true } }),
    db.productVariant.findUnique({ where: { id: variantB }, select: { productId: true } }),
  ]);
  assert.ok(
    ids.indexOf(pa!.productId) < ids.indexOf(pb!.productId),
    "9 ordered must outrank 2 ordered"
  );
});

test("abandoned and cancelled orders are not evidence of demand", async () => {
  const before = await mostOrderedInCategory(categorySlug);
  const rankBefore = before.map((i) => i.id);

  /* A hundred units, none of which anybody paid for or accepted. */
  await placeOrder("pending_payment", [{ variantId: variantB, qty: 100 }]);
  await placeOrder("cancelled", [{ variantId: variantB, qty: 100 }]);

  const after = await mostOrderedInCategory(categorySlug);
  assert.deepEqual(after.map((i) => i.id), rankBefore, "the ranking must not move");
});
