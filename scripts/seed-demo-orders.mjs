#!/usr/bin/env node
/**
 * Demo customers and orders, for looking at the operations console.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT prisma/seed.ts
 *
 * `prisma/seed.ts` builds the catalogue — categories, brands, products, stock,
 * pincodes. It deliberately creates no customers and no orders, which is right:
 * a catalogue seed runs anywhere, and inventing customers is not something that
 * should be able to happen against a real database by accident.
 *
 * But an operations console with no orders in it shows nothing. Every screen
 * that matters — the dispatch board, the queue, payments, reports — is a view
 * over orders. So this exists separately, and it is fenced.
 *
 * THE FENCE
 *
 * It refuses to run unless VE_TEST_DATABASE=1, the same marker the test suite
 * uses to assert a database is disposable, AND the connection is to localhost.
 * Both, not either. Fabricated customers in a production database would be
 * indistinguishable from real ones a week later, and the orders carry payment
 * rows.
 *
 *   npm run db:demo
 *
 * Everything it writes is prefixed DEMO- or ends @demo.invalid, so it can be
 * found and removed. Re-running replaces its own rows and touches nothing else.
 *
 * IT ALSO SEEDS THE FULFILMENT SIDE, AND HERE IS WHY
 *
 * The dispatch board, the roster, the pick list, the packing slip and proof of
 * delivery were all built in September and every one of them is a view over
 * `Shipment`. The demo database had thirteen orders and zero shipments, so all
 * five screens rendered empty and the whole fulfilment loop looked unbuilt to
 * anyone who signed in to look at it.
 *
 * So the orders below now carry shipments, and there are drivers and vehicles to
 * assign them to. The shipment's state follows its order's — an order that is
 * `packed` has a shipment waiting for a driver, one that is `out_for_delivery`
 * has a driver, a vehicle and a handover code. That mirroring is a shape for
 * demo data, not a business rule: `Order.status` stays authoritative in the real
 * code and is deliberately not derived from shipments yet (ISS-009).
 *
 * One order is split across two shipments, because "Shipment 1 of 2" on the
 * packing slip is exactly the case that is wrong if nobody ever looks at it.
 */
import { PrismaClient } from "@/prisma/generated/client/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";

const url = process.env.DATABASE_URL ?? "";
const localish = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

if (process.env.VE_TEST_DATABASE !== "1" || !localish) {
  process.stderr.write(
    "\n=== Demo seed: refusing to run ===\n\n" +
      "  This writes fabricated customers, orders and payments.\n" +
      "  It runs only against a local database explicitly marked disposable.\n\n" +
      "  Required: VE_TEST_DATABASE=1 and a localhost DATABASE_URL.\n" +
      `  Marker set: ${process.env.VE_TEST_DATABASE === "1"} · localhost: ${localish}\n\n` +
      "  Use:  npm run db:demo\n\n"
  );
  process.exit(1);
}

/* Prisma 7 requires an explicit driver adapter; without one the client
   throws at construction. */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

/** Inclusive GST extraction — the same direction as lib/services/tax.ts. */
function gst(totalPaise, ratePct) {
  const taxable = Math.round((totalPaise * 100) / (100 + ratePct));
  const tax = totalPaise - taxable;
  const half = Math.floor(tax / 2);
  return { taxable, cgst: half, sgst: tax - half, tax };
}

const PEOPLE = [
  { name: "Bilal Ahmad",   phone: "+919000000101", buyerType: "contractor", area: "Hyderpora",  pincode: "190014", access: "truck can reach the gate, unload at rear" },
  { name: "Iqra Nabi",     phone: "+919000000102", buyerType: "homeowner",  area: "Rajbagh",    pincode: "190008", access: "narrow lane, small vehicle only" },
  { name: "Mudasir Khan",  phone: "+919000000103", buyerType: "contractor", area: "Bemina",     pincode: "190010", access: null },
  { name: "Shazia Mir",    phone: "+919000000104", buyerType: "designer",   area: "Natipora",   pincode: "190015", access: "gate is locked after 6 PM" },
  { name: "Rouf Ahmad",    phone: "+919000000105", buyerType: null,         area: "Nowgam",     pincode: "190005", access: null },
];

/** status, days ago, payment method, paid? */
const PLAN = [
  ["delivered",        26, "razorpay", true],
  ["delivered",        23, "cod",      true],
  ["delivered",        19, "razorpay", true],
  ["delivered",        16, "razorpay", true],
  ["delivered",        12, "cod",      true],
  ["delivered",         9, "razorpay", true],
  ["refunded",          8, "razorpay", true],
  ["delivered",         6, "razorpay", true],
  ["out_for_delivery",  2, "cod",      true],
  ["packed",            1, "razorpay", true],
  ["confirmed",         1, "razorpay", true],
  /* Three orders sit at `confirmed`, which is what puts a shipment on the pick
     list. One would render a single line and demonstrate nothing: the list
     exists to prove that the same item wanted by several shipments is one walk
     to that aisle, and that needs several shipments wanting it. */
  ["confirmed",         0, "cod",      true],
  ["confirmed",         0, "razorpay", true],
  ["cancelled",         4, "razorpay", false],
  ["pending_payment",   0, "razorpay", false],
];

/**
 * The roster. Two drivers with a vehicle each and one on his own bike — the
 * vehicle is nullable precisely because that last case is real, and a demo that
 * never shows it hides the reason.
 */
const DRIVERS = [
  { name: "DEMO Aadil Bhat",    phone: "+919000000201", vehicle: "DEMO-JK01AB1234" },
  { name: "DEMO Suhail Wani",   phone: "+919000000202", vehicle: "DEMO-JK01CD5678" },
  { name: "DEMO Nasir Lone",    phone: "+919000000203", vehicle: null },
];

const VEHICLES = [
  { registration: "DEMO-JK01AB1234", kind: "van" },
  { registration: "DEMO-JK01CD5678", kind: "truck" },
];

/**
 * Where an order's status leaves its shipment.
 *
 * `null` means no shipment at all, which is right for an order that was never
 * paid for and one that was cancelled before anything was picked.
 */
const SHIPMENT_FOR_ORDER = {
  pending_payment: null,
  cancelled: null,
  confirmed: "pending",
  packed: "packed",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  refunded: "delivered",
};

const ago = (days, hour) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, (hour * 7) % 60, 0, 0);
  return d;
};

async function main() {
  /* Remove only what a previous run of this script wrote. */
  const prior = await db.user.findMany({
    where: { email: { endsWith: "@demo.invalid" } },
    select: { id: true },
  });
  if (prior.length) {
    const ids = prior.map((u) => u.id);
    /* Shipments cascade from the order; their audit rows do not, so they go
       first and are matched by id rather than by entityType — deleting every
       row of type "shipment" would take a real one's trail with it. */
    const priorShipments = await db.shipment.findMany({
      where: { order: { userId: { in: ids } } },
      select: { id: true },
    });
    if (priorShipments.length) {
      await db.auditLog.deleteMany({
        where: { entityType: "shipment", entityId: { in: priorShipments.map((x) => x.id) } },
      });
    }
    await db.order.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`cleared ${prior.length} demo customers and their orders`);
  }

  /* The roster is not owned by a demo customer, so it needs clearing by its own
     marker. Retiring rather than deleting is the rule in the real service —
     a driver who carried shipments is referenced by every one of them — but
     these are fixtures whose shipments have just gone with the orders. */
  const clearedVehicles = await db.vehicle.deleteMany({
    where: { registration: { startsWith: "DEMO-" } },
  });
  const clearedDrivers = await db.driver.deleteMany({ where: { name: { startsWith: "DEMO " } } });
  if (clearedDrivers.count || clearedVehicles.count) {
    console.log(`cleared ${clearedDrivers.count} demo drivers and ${clearedVehicles.count} vehicles`);
  }

  /* `--clear` removes and stops. Used to take demo rows back out of a database
     that should not have them — they broke two counting assertions in the test
     suite the first time these shared one. */
  if (process.argv.includes("--clear")) {
    console.log("cleared only; nothing seeded");
    return;
  }

  const warehouse = await db.warehouse.findFirst({ select: { id: true } });
  const variants = await db.productVariant.findMany({
    take: 40,
    select: {
      id: true,
      name: true,
      sku: true,
      pricePaise: true,
      product: {
        select: { title: true, category: { select: { slug: true, isBulk: true } } },
      },
    },
  });

  if (variants.length === 0) {
    console.error("No products. Run `npm run db:seed` first.");
    process.exit(1);
  }

  /* Rates matching lib/services/tax.ts, so the breakups on screen are the ones
     the real code would have produced. */
  const rateFor = (slug) => (slug === "cement" ? 28 : 18);
  const hsnFor = (slug) => (slug === "cement" ? "2523" : "3214");

  const users = [];
  for (const p of PEOPLE) {
    const id = randomUUID();
    await db.user.create({
      data: {
        id,
        phone: p.phone,
        email: `${p.name.toLowerCase().replace(/\W+/g, ".")}@demo.invalid`,
        role: "customer",
        createdAt: ago(40 + PEOPLE.indexOf(p) * 5, 10),
        profile: { create: { fullName: p.name, buyerType: p.buyerType } },
        wallet: { create: { balancePaise: 0 } },
        addresses: {
          create: {
            label: "site",
            name: `${p.area} Site`,
            phone: p.phone,
            line1: `Plot ${10 + PEOPLE.indexOf(p) * 7}, ${p.area}`,
            landmark: "near the main road",
            accessNote: p.access,
            city: "Srinagar",
            state: "Jammu & Kashmir",
            pincode: p.pincode,
            isDefault: true,
          },
        },
      },
    });
    users.push({ ...p, id });
  }

  /* The roster, before the orders, because a dispatched shipment needs a driver
     to point at. */
  const vehicles = new Map();
  for (const v of VEHICLES) {
    const row = await db.vehicle.create({ data: { registration: v.registration, kind: v.kind } });
    vehicles.set(v.registration, row.id);
  }
  const drivers = [];
  for (const d of DRIVERS) {
    const row = await db.driver.create({ data: { name: d.name, phone: d.phone } });
    drivers.push({ ...row, vehicleId: d.vehicle ? vehicles.get(d.vehicle) : null });
  }

  /* Handover codes, printed at the end so somebody can actually try confirming a
     delivery. The real one comes from `generateDeliveryCode` at dispatch; this is
     the same six-digit shape. */
  const codes = [];
  let shipmentCount = 0;

  let n = 0;
  for (const [status, days, method, paid] of PLAN) {
    const user = users[n % users.length];
    const placedAt = ago(days, 9 + (n % 9));
    /* Two or three lines, walked through the variant list so orders differ and
       some of them mix a heavy line with light ones. */
    const lines = [];
    for (let k = 0; k < 2 + (n % 2); k++) {
      /* The confirmed orders draw from a deliberately narrow window so they
         overlap. Everything else walks the whole catalogue so the order list
         looks varied. */
      const v =
        status === "confirmed"
          ? variants[(n + k) % 3]
          : variants[(n * 3 + k * 5) % variants.length];
      const qty = v.product.category.isBulk ? 10 + ((n * 3) % 30) : 1 + (k % 3);
      lines.push({ v, qty });
    }

    let subtotal = 0;
    const items = lines.map(({ v, qty }) => {
      const lineTotal = v.pricePaise * qty;
      subtotal += lineTotal;
      const rate = rateFor(v.product.category.slug);
      const g = gst(lineTotal, rate);
      return {
        variantId: v.id,
        title: v.product.title,
        variantName: v.name,
        unitPricePaise: v.pricePaise,
        qty,
        lineTotalPaise: lineTotal,
        subtotalPaise: lineTotal,
        discountPaise: 0,
        taxableValuePaise: g.taxable,
        cgstPaise: g.cgst,
        sgstPaise: g.sgst,
        igstPaise: 0,
        gstRate: rate,
        hsnCode: hsnFor(v.product.category.slug),
        totalPaise: lineTotal,
      };
    });

    const deliveryFee = subtotal >= 500_00 ? 0 : 49_00;
    const tax = items.reduce((s, i) => s + i.cgstPaise + i.sgstPaise, 0);
    const total = subtotal + deliveryFee;

    const order = await db.order.create({
      data: {
        orderNo: `DEMO-${String(24800 + n)}`,
        userId: user.id,
        address: {
          name: `${user.area} Site`,
          line1: `Plot ${10 + users.indexOf(user) * 7}, ${user.area}`,
          city: "Srinagar",
          state: "Jammu & Kashmir",
          pincode: user.pincode,
          phone: user.phone,
        },
        status,
        paymentMethod: method,
        subtotalPaise: subtotal,
        taxPaise: tax,
        deliveryFeePaise: deliveryFee,
        totalPaise: total,
        warehouseId: warehouse?.id ?? null,
        placedAt,
        deliveredAt: status === "delivered" ? new Date(+placedAt + 5 * 3600_000) : null,
        items: { create: items },
      },
      /* The lines come back because a shipment has to point at them. */
      include: { items: { select: { id: true, qty: true } } },
    });

    if (paid) {
      await db.payment.create({
        data: {
          orderId: order.id,
          gateway: method,
          amountPaise: total,
          status: status === "refunded" ? "refunded" : method === "cod" ? "created" : "captured",
          signatureVerified: method !== "cod",
          gatewayPaymentId: `demo_pay_${n}`,
          createdAt: placedAt,
        },
      });
    }

    /* Status events, so the timeline and the fulfilment durations have shape.
       Spaced by a couple of hours, which is what makes a packing or delivery
       target measurable at all once one is set. */
    const trail = {
      pending_payment: [],
      confirmed: ["confirmed"],
      packed: ["confirmed", "packed"],
      out_for_delivery: ["confirmed", "packed", "out_for_delivery"],
      delivered: ["confirmed", "packed", "out_for_delivery", "delivered"],
      cancelled: ["cancelled"],
      refunded: ["confirmed", "packed", "delivered", "refunded"],
    }[status];

    let from = null;
    for (const [i, to] of trail.entries()) {
      await db.orderStatusEvent.create({
        data: {
          orderId: order.id,
          fromStatus: from,
          toStatus: to,
          createdAt: new Date(+placedAt + (i + 1) * 95 * 60_000),
        },
      });
      from = to;
    }

    /* The shipment. An order that was never paid for and one that was cancelled
       before anything was picked get none — which is also what makes the
       dispatch board's counts mean something. */
    const shipStatus = SHIPMENT_FOR_ORDER[status];
    if (shipStatus) {
      /* One order is split in two so the packing slip's "Shipment 1 of 2" and
         the board's two rows against one order are both visible. The packed
         order is the one worth splitting: it is the state a slip gets printed
         in. */
      const split = status === "packed" && order.items.length >= 2;
      const groups = split
        ? [order.items.slice(0, 1), order.items.slice(1)]
        : [order.items];

      for (const [g, group] of groups.entries()) {
        const dispatched = shipStatus === "out_for_delivery" || shipStatus === "delivered";
        const driver = dispatched ? drivers[n % drivers.length] : null;
        const code = dispatched
          ? String((n * 137 + g * 31 + 100_000) % 1_000_000).padStart(6, "0")
          : null;

        const shipment = await db.shipment.create({
          data: {
            orderId: order.id,
            sequence: g + 1,
            /* Arbitrary, and only so the pick list's express-first sort has both
               kinds to sort. The real value comes from what the customer chose
               at checkout. */
            speedClass: n % 3 === 0 ? "express" : "scheduled",
            status: shipStatus,
            warehouseId: warehouse?.id ?? null,
            dispatchedAt: dispatched ? new Date(+placedAt + 3 * 3600_000) : null,
            deliveredAt: shipStatus === "delivered" ? new Date(+placedAt + 5 * 3600_000) : null,
            deliveryCode: code,
            driverId: driver?.id ?? null,
            vehicleId: driver?.vehicleId ?? null,
            createdAt: placedAt,
            items: {
              create: group.map((it) => ({ orderItemId: it.id, qty: it.qty })),
            },
          },
        });
        shipmentCount++;
        if (shipStatus === "out_for_delivery") {
          codes.push(`${order.orderNo}-${g + 1}  ${code}  ${driver?.name ?? "-"}`);
        }
        void shipment;
      }
    }

    n++;
  }

  console.log(`seeded ${users.length} demo customers and ${PLAN.length} demo orders`);
  console.log(`seeded ${drivers.length} drivers, ${VEHICLES.length} vehicles, ${shipmentCount} shipments`);
  console.log("all of them are prefixed DEMO- or end @demo.invalid");
  if (codes.length) {
    console.log("\nhandover codes for the shipments on the road, for trying proof of delivery:");
    for (const c of codes) console.log(`  ${c}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
