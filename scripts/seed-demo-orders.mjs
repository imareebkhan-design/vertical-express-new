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
 */
import { PrismaClient } from "@prisma/client";
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

const db = new PrismaClient();

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
  ["cancelled",         4, "razorpay", false],
  ["pending_payment",   0, "razorpay", false],
];

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
    await db.order.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`cleared ${prior.length} demo customers and their orders`);
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

  let n = 0;
  for (const [status, days, method, paid] of PLAN) {
    const user = users[n % users.length];
    const placedAt = ago(days, 9 + (n % 9));
    /* Two or three lines, walked through the variant list so orders differ and
       some of them mix a heavy line with light ones. */
    const lines = [];
    for (let k = 0; k < 2 + (n % 2); k++) {
      const v = variants[(n * 3 + k * 5) % variants.length];
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

    n++;
  }

  console.log(`seeded ${users.length} demo customers and ${PLAN.length} demo orders`);
  console.log("all of them are prefixed DEMO- or end @demo.invalid");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
