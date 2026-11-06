import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";

import { getOpsToday } from "../today";
import { getOpsExceptions } from "../exceptions";
import { getBiData } from "../bi";
import {
  adminListCustomers,
  adminCustomerDetail,
  adminCustomerMix,
  adminListPayments,
  adminPaymentHealth,
  adminListServiceability,
  adminListStock,
} from "../stock";
import { adminListOrders, adminGetOrder, adminListProducts } from "../manage";

/**
 * Every reader behind an operations screen, run once against a real database.
 *
 * WHY THIS IS SEPARATE FROM THE SCREEN TESTS
 *
 * The console is gated on a Firebase session and an email allowlist, so these
 * pages cannot be opened by anything that is not a signed-in admin. A build
 * proves the modules compile and the types line up; it does not run a single
 * query. That left the most likely failure — a bad `select`, a null the JSX
 * does not expect, a relation that was renamed — invisible until somebody
 * signed in and hit a 500.
 *
 * So each reader is called here the way its page calls it. It is a smoke test
 * on purpose: it asserts shape and internal consistency rather than values,
 * because the values belong to whatever data happens to be present.
 */

test("the dashboard's readers run", async () => {
  const t = await getOpsToday();
  assert.ok(Number.isInteger(t.ordersToday) && t.ordersToday >= 0);
  assert.ok(Number.isInteger(t.revenueTodayPaise));
  assert.ok(Array.isArray(t.queue));
  assert.ok(Array.isArray(t.lowStock));
  /* Every queue entry is rendered as a row with a link, so each needs the
     fields that row reads. A missing orderNo is a broken link, not a blank. */
  for (const q of t.queue) {
    assert.ok(q.orderNo, "a queue item has no order number to link to");
    assert.ok(q.placedAt instanceof Date);
    assert.ok(typeof q.customer === "string");
  }

  const e = await getOpsExceptions();
  assert.ok(Array.isArray(e.found) && Array.isArray(e.unwatchable));
});

test("the order screens' readers run, and detail matches list", async () => {
  const { orders } = await adminListOrders(1, 10);
  assert.ok(Array.isArray(orders));

  /* The deeper checks need an order to check. They are conditional rather than
     required because this suite must pass on a freshly created test database,
     which has a catalogue and nothing else — `npm run db:demo` is what puts
     orders in one. Calling the reader at all is the part that is never
     vacuous, and it is the part that catches a broken query. */
  if (orders.length > 0) {
    const detail = await adminGetOrder(orders[0].orderNo);
    assert.ok(detail, `order ${orders[0].orderNo} is in the list but not fetchable`);
    assert.equal(detail.orderNo, orders[0].orderNo);
    assert.ok(Array.isArray(detail.items));
    /* The bill panel sums the per-line tax snapshot. If a line carries a
       taxable value it must carry the split too, or the panel silently
       under-reports the tax on that order. */
    for (const i of detail.items) {
      if (i.taxableValuePaise !== null) {
        const split = (i.cgstPaise ?? 0) + (i.sgstPaise ?? 0) + (i.igstPaise ?? 0);
        assert.ok(split >= 0);
        assert.equal(
          i.taxableValuePaise + split,
          i.totalPaise ?? i.lineTotalPaise,
          `line "${i.title}" does not add up: taxable + tax must equal the line total`
        );
      }
    }
  }
});

test("the customer screens' readers run, and detail matches list", async () => {
  const list = await adminListCustomers(1, 10);
  assert.ok(Array.isArray(list.rows));
  await adminCustomerMix();

  if (list.rows.length > 0) {
    const c = await adminCustomerDetail(list.rows[0].id);
    assert.ok(c, "a customer in the list is not fetchable by id");
    assert.equal(c.id, list.rows[0].id);
    assert.ok(Array.isArray(c.addresses));
    assert.ok(Array.isArray(c.orders));
    /* Lifetime value excludes cancelled and refunded. The list computes the
       same figure its own way, so the two must agree — they are shown one
       click apart and a mismatch is the kind of thing nobody reports. */
    assert.equal(
      c.lifetimePaise,
      list.rows[0].lifetimePaise,
      "the detail page and the list disagree about lifetime value"
    );
    assert.equal(c.orderCount, list.rows[0].orderCount);
    if (c.averageOrderPaise !== null) {
      assert.ok(Number.isInteger(c.averageOrderPaise), "an average in fractional paise");
    }
  }
});

test("a customer id that does not exist returns null, not a throw", async () => {
  /* The page calls notFound() on null. A throw here is a 500 instead of a 404,
     which is what a stale bookmark would produce. */
  const missing = await adminCustomerDetail("00000000-0000-0000-0000-000000000000");
  assert.equal(missing, null);
});

test("the catalogue, stock, payment and serviceability readers run", async () => {
  const products = await adminListProducts();
  assert.ok(Array.isArray(products.products));

  await adminListStock();
  await adminListPayments(1, 10);
  await adminPaymentHealth();

  const s = await adminListServiceability();
  assert.ok(Array.isArray(s.pincodes));
  assert.ok(Array.isArray(s.warehouses));
});

test("the product editor's query runs for every published product", async () => {
  /* The editor selects a deeper tree than the list does — images, per-warehouse
     inventory, the category's tax slug. One product with no variants or no
     inventory row is enough to break it, and that is exactly the product
     somebody opens first. */
  const slugs = await db.product.findMany({ select: { slug: true }, take: 25 });
  assert.ok(slugs.length > 0, "no products to check — this guard would be vacuous");

  for (const { slug } of slugs) {
    const p = await db.product.findUnique({
      where: { slug },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        brandId: true,
        deliverySpeed: true,
        category: { select: { slug: true, name: true, group: true, isBulk: true } },
        images: { select: { id: true, url: true, alt: true, isPrimary: true } },
        variants: {
          select: {
            id: true,
            name: true,
            sku: true,
            pricePaise: true,
            compareAtPaise: true,
            inventory: {
              select: {
                qtyOnHand: true,
                qtyReserved: true,
                lowStockThreshold: true,
                warehouse: { select: { id: true, name: true, city: true } },
              },
            },
          },
        },
      },
    });
    assert.ok(p, `product ${slug} is listed but not fetchable`);
    assert.ok(p.category, `product ${slug} has no category — the editor reads its name`);
  }
});

test("the reporting suite runs end to end", async () => {
  const bi = await getBiData({});
  assert.ok(bi.sales && bi.orders && bi.products && bi.inventory);
  assert.ok(bi.customers && bi.marketing && bi.finance && bi.operations);
  assert.ok(Array.isArray(bi.operations.ordersBySpeed));
  /* Every tile on the executive row must render something. A NaN reaches the
     screen as "NaN", which looks like a bug to the reader and is one. */
  for (const [name, v] of Object.entries({
    gross: bi.sales.grossSalesPaise,
    net: bi.sales.netSalesPaise,
    aov: bi.sales.aovPaise,
    orders: bi.sales.ordersCount,
    ltv: bi.customers.ltvAvgPaise,
  })) {
    assert.ok(Number.isFinite(v), `${name} is not a finite number (${v})`);
  }

  /* Stock value used to be in that list, and being a finite number was the
     whole problem: it was qtyOnHand times the SELLING price, which overstates
     stock by the entire margin on a card a bank or an insurer would be shown.
     There is no cost price in the schema (ISS-062), so the honest value is
     absent. Turnover and warehouse utilisation are absent for the same kind of
     reason — no cost of goods sold, and no capacity column on Warehouse.

     Null rather than zero, and the cards say what is missing. Zero would be a
     measurement; this is the absence of one. */
  assert.equal(bi.inventory.totalValuePaise, null, "stock cannot be valued without a cost price");
  assert.equal(bi.inventory.turnoverRate, null, "turnover needs cost of goods sold");
  assert.equal(bi.inventory.utilizationPct, null, "Warehouse has no capacity to divide by");
});
