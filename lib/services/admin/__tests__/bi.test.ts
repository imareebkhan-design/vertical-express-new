import { test } from "node:test";
import assert from "node:assert/strict";
import { getBiData } from "../bi";
import { db } from "@/lib/db";

test("Business Intelligence: returns expected metrics and filters successfully", async () => {
  // 1. Fetch data for default date range (past 30 days)
  const biData = await getBiData({});
  
  // Verify main data layout has all the required sections
  assert.ok(biData.sales);
  assert.ok(biData.orders);
  assert.ok(biData.products);
  assert.ok(biData.inventory);
  assert.ok(biData.customers);
  assert.ok(biData.marketing);
  assert.ok(biData.finance);
  assert.ok(biData.operations);

  // 2. Verify filter option lists are loaded
  assert.ok(Array.isArray(biData.filters.warehouses));
  assert.ok(Array.isArray(biData.filters.brands));
  assert.ok(Array.isArray(biData.filters.categories));
  assert.ok(Array.isArray(biData.filters.products));

  // 3. Verify sales math holds up: netSalesPaise = grossSalesPaise - discountsPaise + gstPaise + shippingPaise - refundsPaise
  const s = biData.sales;
  const computedNet = s.grossSalesPaise - s.discountsPaise + s.gstPaise + s.shippingPaise - s.refundsPaise;
  assert.equal(s.netSalesPaise, Math.max(0, computedNet));

  // 4. Verify orders count aligns with statuses sum
  const o = biData.orders;
  const statusSum = o.pending + o.confirmed + o.packed + o.outForDelivery + o.delivered + o.cancelled;
  assert.equal(s.ordersCount, statusSum);

  /* 5. Inventory. The counts are real; the three money-and-capacity figures are
     null and must stay null.

     Stock value was `qtyOnHand * pricePaise` — the SELLING price, which
     overstates stock by the whole margin, on a card labelled "Current Stock
     Value". That is the figure quoted to a bank or an insurer in good faith,
     and /admin/inventory already said stock value was a sentence rather than a
     number. Turnover divided net sales by that same wrong total. Utilisation
     divided by an invented ten thousand units per warehouse — `Warehouse` has
     no capacity column at all.

     None is computable without a cost basis (ISS-062) or a real capacity, and
     an unavailable number must not be a plausible one. */
  const inv = biData.inventory;
  assert.equal(inv.totalValuePaise, null, "stock cannot be valued without a cost price");
  assert.equal(inv.turnoverRate, null, "turnover needs cost of goods sold");
  assert.equal(inv.utilizationPct, null, "Warehouse has no capacity to divide by");
  assert.ok(inv.outOfStockCount >= 0);
  assert.ok(inv.lowStockCount >= 0);

  /* 6. On-time performance is null until somebody sets the target.
     It used to be hardcoded at 120/240 minutes and reported as compliance;
     worse, an empty period returned 100 — zero deliveries read as perfect
     delivery. Null now means "not measured", and the screen says so. */
  const op = biData.operations;
  assert.equal(op.packSlaMinutes, null, "no packing target is configured in the test database");
  assert.equal(op.packingSlaPct, null, "an unset target must not produce a percentage");
  assert.equal(op.deliverySlaPct, null);
});

test("Business Intelligence: filtering by specific brand, category, and warehouse works", async () => {
  // Get active brand, category, and warehouse
  const wh = await db.warehouse.findFirst({ select: { id: true } });
  const brand = await db.brand.findFirst({ select: { id: true } });
  const category = await db.category.findFirst({ select: { id: true } });

  if (wh && brand && category) {
    const filtered = await getBiData({
      warehouseId: wh.id,
      brandId: brand.id,
      categoryId: category.id,
    });
    
    assert.ok(filtered.sales.ordersCount >= 0);
  }
});

test("Orders by delivery speed: a mixed order counts as heavy", async () => {
  /* The vehicle is decided by the heaviest thing in the order, not by the
     majority of its lines. An order of one cement bag and nine boxes of
     screws still needs a truck, and counting it as fast would understate
     exactly the number this chart exists to show rising through winter.

     Asserted on the invariant rather than by building a fixture order:
     express + heavy must equal the orders in the period, and no week may
     report a negative or fractional count. Double-counting a mixed order —
     the obvious way to get this wrong — breaks the first of those. */
  const { operations, sales } = await getBiData({});
  const counted = operations.ordersBySpeed.reduce((s, w) => s + w.express + w.heavy, 0);
  assert.equal(
    counted,
    sales.ordersCount,
    "orders are being double-counted or dropped in the speed split"
  );
  for (const w of operations.ordersBySpeed) {
    assert.ok(Number.isInteger(w.express) && w.express >= 0);
    assert.ok(Number.isInteger(w.heavy) && w.heavy >= 0);
    assert.match(w.week, /^W\d{2}$/, `"${w.week}" is not an ISO week label`);
  }
});

test("Orders by delivery speed: weeks come back in order", async () => {
  const { operations } = await getBiData({});
  const weeks = operations.ordersBySpeed.map((w) => w.week);
  assert.deepEqual(weeks, [...weeks].sort(), "the weeks are not chronological");
});
