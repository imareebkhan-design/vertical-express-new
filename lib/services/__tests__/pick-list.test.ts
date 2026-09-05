import test from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { getPickList } from "@/lib/services/shipments";

/**
 * The pick list — what to collect from the shelves.
 *
 * ISS-009 has named it missing since August. It is the one piece of the
 * warehouse half that needs nothing from the owner: a question about data that
 * already exists.
 *
 * The property that makes it worth having is the aggregation. Four shipments of
 * the same cement is one trip to that aisle, not four — a list that repeats the
 * item per shipment is a list that sends somebody back and forth, which is
 * exactly what a pick list exists to prevent.
 */

let seq = 0;
const uniq = () => `zzz-pick-${Date.now()}-${seq++}`;

async function scratchOrderWithShipment(opts: {
  status: "pending" | "packed";
  speedClass: "express" | "scheduled";
  variantId: string;
  qty: number;
  title: string;
}) {
  const user = await db.user.findFirstOrThrow({ select: { id: true } });
  const wh = await db.warehouse.findFirstOrThrow({ select: { id: true } });

  const order = await db.order.create({
    data: {
      orderNo: uniq(), userId: user.id, status: "confirmed", subtotalPaise: 100,
      discountPaise: 0, deliveryFeePaise: 0, taxPaise: 0, totalPaise: 100,
      paymentMethod: "razorpay", address: {}, warehouseId: wh.id,
      items: {
        create: {
          variantId: opts.variantId,
          title: opts.title,
          variantName: "50 kg",
          unitPricePaise: 100,
          qty: opts.qty,
          lineTotalPaise: 100 * opts.qty,
        },
      },
    },
    include: { items: true },
  });

  const shipment = await db.shipment.create({
    data: {
      orderId: order.id, sequence: 1, speedClass: opts.speedClass,
      status: opts.status, warehouseId: wh.id,
      items: { create: { orderItemId: order.items[0].id, qty: opts.qty } },
    },
  });
  return { orderNo: order.orderNo, shipmentId: shipment.id };
}

async function scratchVariant(title: string) {
  const brand = await db.brand.findFirstOrThrow({ select: { id: true } });
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  const product = await db.product.create({
    data: {
      slug: uniq(), title, brandId: brand.id, categoryId: category.id,
      unitLabel: "per bag", status: "published",
    },
  });
  const variant = await db.productVariant.create({
    data: {
      productId: product.id, name: "50 kg", sku: uniq(),
      pricePaise: 100, isDefault: true, isActive: true,
    },
  });
  return variant.id;
}

async function cleanup() {
  await db.order.deleteMany({ where: { orderNo: { startsWith: "zzz-pick-" } } });
  await db.product.deleteMany({ where: { slug: { startsWith: "zzz-pick-" } } });
}

test("the same item across shipments is one line, not four trips", async (t) => {
  /* The whole point. A picker walking the same aisle once per shipment is what
     this exists to stop. */
  t.after(cleanup);
  const variantId = await scratchVariant("ZZZ Pick Cement");

  const a = await scratchOrderWithShipment({
    status: "pending", speedClass: "scheduled", variantId, qty: 3, title: "ZZZ Pick Cement",
  });
  const b = await scratchOrderWithShipment({
    status: "pending", speedClass: "scheduled", variantId, qty: 5, title: "ZZZ Pick Cement",
  });

  const list = await getPickList();
  const line = list.find((l) => l.variantId === variantId);
  assert.ok(line, "the item is not on the pick list at all");
  assert.equal(line.totalQty, 8, "the quantities across shipments were not added up");
  assert.equal(line.forShipments.length, 2, "the line does not say which shipments want it");

  /* And the sort at the bench is possible without another query. */
  const refs = line.forShipments.map((s) => `${s.ref}:${s.qty}`).sort();
  assert.deepEqual(refs, [`${a.orderNo}-1:3`, `${b.orderNo}-1:5`].sort());
});

test("a packed shipment is not picked again", async (t) => {
  /* Including it would have somebody collect the same goods twice. */
  t.after(cleanup);
  const variantId = await scratchVariant("ZZZ Pick Packed");
  await scratchOrderWithShipment({
    status: "packed", speedClass: "express", variantId, qty: 2, title: "ZZZ Pick Packed",
  });

  const list = await getPickList();
  assert.equal(
    list.find((l) => l.variantId === variantId),
    undefined,
    "a shipment that has already been picked is on the list again"
  );
});

test("express is picked before the truck", async (t) => {
  /* Somebody is waiting on the express one. */
  t.after(cleanup);
  const slow = await scratchVariant("ZZZ Pick Slow");
  const fast = await scratchVariant("ZZZ Pick Fast");

  /* The heavy one has the larger quantity, so if the sort ignored speed it
     would come first. */
  await scratchOrderWithShipment({
    status: "pending", speedClass: "scheduled", variantId: slow, qty: 40, title: "ZZZ Pick Slow",
  });
  await scratchOrderWithShipment({
    status: "pending", speedClass: "express", variantId: fast, qty: 1, title: "ZZZ Pick Fast",
  });

  const list = await getPickList();
  const iFast = list.findIndex((l) => l.variantId === fast);
  const iSlow = list.findIndex((l) => l.variantId === slow);
  assert.ok(iFast >= 0 && iSlow >= 0, "one of the scratch items is missing from the list");
  assert.ok(iFast < iSlow, "a 40-unit truck line was picked before a 1-unit express line");
});

test("an item wanted by both lanes is picked with the express one", async (t) => {
  /* Otherwise the express shipment waits for a truck run. */
  t.after(cleanup);
  const variantId = await scratchVariant("ZZZ Pick Both");
  await scratchOrderWithShipment({
    status: "pending", speedClass: "scheduled", variantId, qty: 10, title: "ZZZ Pick Both",
  });
  await scratchOrderWithShipment({
    status: "pending", speedClass: "express", variantId, qty: 1, title: "ZZZ Pick Both",
  });

  const list = await getPickList();
  const line = list.find((l) => l.variantId === variantId);
  assert.ok(line);
  assert.equal(line.speedClass, "express", "a line the express lane needs was marked as truck");
  assert.equal(line.totalQty, 11);
});

test("an empty warehouse queue produces an empty list, not a crash", async (t) => {
  t.after(cleanup);
  const list = await getPickList();
  assert.ok(Array.isArray(list), "the pick list is not a list");
});
