import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "@/lib/db";
import { getPackingSlip } from "@/lib/services/shipments";
import { advanceShipment, assignShipment } from "@/lib/services/admin/shipments-write";

/**
 * The document that goes in the box.
 *
 * ISS-009 has named it missing since August. It is not a tax invoice and does
 * not pretend to be one — no GSTIN, no HSN, no place of supply, none of which
 * can exist until the business is GST-registered (ISS-026). It is a checklist
 * of what is in this load.
 *
 * The property worth a test above all others: **the delivery code must never be
 * on it.** Printing the handover code and putting it in the box gives the proof
 * to whoever is holding the parcel, which defeats the check entirely.
 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

let seq = 0;
const uniq = () => `zzz-slip-${Date.now()}-${seq++}`;

async function scratchShipment(opts: { shipments: number }) {
  const user = await db.user.findFirstOrThrow({ select: { id: true } });
  const wh = await db.warehouse.findFirstOrThrow({ select: { id: true } });
  const variant = await db.productVariant.findFirstOrThrow({ select: { id: true, sku: true } });

  const order = await db.order.create({
    data: {
      orderNo: uniq(), userId: user.id, status: "confirmed", subtotalPaise: 100,
      discountPaise: 0, deliveryFeePaise: 0, taxPaise: 0, totalPaise: 100,
      paymentMethod: "razorpay", warehouseId: wh.id,
      address: {
        label: "Site", name: "Bilal Ahmad", phone: "+919876543210",
        line1: "Near the mosque", line2: null, landmark: "Blue gate",
        city: "Srinagar", state: "Jammu & Kashmir", pincode: "190002",
      },
      items: {
        create: {
          variantId: variant.id, title: "ZZZ Slip Cement", variantName: "50 kg",
          unitPricePaise: 100, qty: 4, lineTotalPaise: 400,
        },
      },
    },
    include: { items: true },
  });

  const made = [];
  for (let i = 1; i <= opts.shipments; i++) {
    made.push(
      await db.shipment.create({
        data: {
          orderId: order.id, sequence: i, speedClass: "express",
          status: "pending", warehouseId: wh.id,
          items: { create: { orderItemId: order.items[0].id, qty: 4 } },
        },
      })
    );
  }
  return { orderNo: order.orderNo, shipments: made, userId: user.id };
}

async function cleanup() {
  /* Audit rows are found through the scratch shipments that produced them, not
     by entityType. Deleting every row of type "shipment" would wipe the trail
     for real shipments too — harmless today only because the demo seed has none,
     and quietly destructive the moment it does. */
  const scratch = await db.shipment.findMany({
    where: { order: { orderNo: { startsWith: "zzz-slip-" } } },
    select: { id: true },
  });
  await db.auditLog.deleteMany({
    where: { entityType: "shipment", entityId: { in: scratch.map((s) => s.id) } },
  });
  await db.order.deleteMany({ where: { orderNo: { startsWith: "zzz-slip-" } } });
  await db.driver.deleteMany({ where: { name: "ZZZ Slip Driver" } });
}

test("the slip lists what is in the box and where it goes", async (t) => {
  t.after(cleanup);
  const { shipments, orderNo } = await scratchShipment({ shipments: 1 });

  const slip = await getPackingSlip(shipments[0].id);
  assert.ok(slip, "no slip was produced for a real shipment");
  assert.equal(slip.ref, `${orderNo}-1`);
  assert.equal(slip.lines.length, 1);
  assert.equal(slip.lines[0].qty, 4);
  assert.equal(slip.totalUnits, 4);
  assert.equal(slip.address?.name, "Bilal Ahmad");
  assert.equal(slip.address?.pincode, "190002");
});

test("a customer receiving half an order is told the rest is coming", async (t) => {
  /* Somebody who gets one of two deliveries and no word about the other
     assumes something is lost. The count comes from the order rather than
     being passed in, so it cannot disagree with reality. */
  t.after(cleanup);
  const { shipments } = await scratchShipment({ shipments: 2 });

  const first = await getPackingSlip(shipments[0].id);
  assert.ok(first);
  assert.equal(first.sequence, 1);
  assert.equal(first.ofShipments, 2, "the slip does not say how many deliveries there are");
});

test("the delivery code is never on the slip", async (t) => {
  /* The one that matters. Printing the handover code and putting it in the box
     gives the proof to whoever is holding the parcel. */
  t.after(cleanup);
  const { shipments, userId } = await scratchShipment({ shipments: 1 });
  const id = shipments[0].id;
  const actor = { id: userId, email: "zzz-slip@demo.invalid" };

  await advanceShipment({ shipmentId: id, to: "packed", actor });
  const driver = await db.driver.create({ data: { name: "ZZZ Slip Driver", phone: uniq() } });
  await assignShipment({ shipmentId: id, driverId: driver.id, actor });
  const out = await advanceShipment({ shipmentId: id, to: "out_for_delivery", actor });
  assert.equal(out.ok, true);
  const code = out.ok === true ? out.deliveryCode : null;
  assert.match(code ?? "", /^\d{6}$/, "no code was issued, so this test proves nothing");

  const slip = await getPackingSlip(id);
  assert.ok(slip);
  assert.ok(
    !JSON.stringify(slip).includes(code!),
    "the delivery code is on the packing slip — anybody holding the parcel would " +
      "hold the proof that they are the right person to receive it"
  );
});

test("the printed page claims no statutory status", () => {
  /* It is not a tax invoice, and the order document had to be corrected once
     for exactly that (677d08a). No GSTIN, no HSN, and no invented registered
     entity — the business name and address are still unconfirmed. */
  const page = readFileSync(
    join(ROOT, "app/admin/shipments/[shipmentId]/packing-slip/page.tsx"),
    "utf8"
  );
  const rendered = page.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

  assert.ok(!/TAX INVOICE/.test(rendered), "the slip badges itself a tax invoice");
  assert.ok(!/Pvt Ltd|Private Limited/.test(rendered), "an unconfirmed legal entity is printed");
  assert.match(
    rendered,
    /not a tax invoice/i,
    "the slip does not say what it is not, beside a list that looks like one"
  );
  assert.ok(
    !/deliveryCode|delivery_code/.test(rendered),
    "the page reads the delivery code, which must never be printed"
  );
});

test("a shipment that does not exist produces nothing, not a crash", async (t) => {
  t.after(cleanup);
  const slip = await getPackingSlip("00000000-0000-0000-0000-000000000000");
  assert.equal(slip, null);
});
