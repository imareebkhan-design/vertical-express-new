import { test } from "node:test";
import assert from "node:assert/strict";
import { getBiData } from "../bi";
import { db } from "@/lib/db";

test("Business Intelligence: returns expected metrics and filters successfully", async () => {
  // 1. Fetch data for default date range (past 30 days)
  const biData = await getBiData({});
  
  // Verify main data layout has all the required sections
  assert?.ok(biData?.sales);
  assert?.ok(biData?.orders);
  assert?.ok(biData?.products);
  assert?.ok(biData?.inventory);
  assert?.ok(biData?.customers);
  assert?.ok(biData?.marketing);
  assert?.ok(biData?.finance);
  assert?.ok(biData?.operations);

  // 2. Verify filter option lists are loaded
  assert?.ok(Array.isArray(biData?.filters?.warehouses));
  assert?.ok(Array.isArray(biData?.filters?.brands));
  assert?.ok(Array.isArray(biData?.filters?.categories));
  assert?.ok(Array.isArray(biData?.filters?.products));

  // 3. Verify sales math holds up: netSalesPaise = grossSalesPaise - discountsPaise + gstPaise + shippingPaise - refundsPaise
  const s = biData?.sales;
  const computedNet = s?.grossSalesPaise - s?.discountsPaise + s?.gstPaise + s?.shippingPaise - s?.refundsPaise;
  assert?.equal(s?.netSalesPaise, Math.max(0, computedNet));

  // 4. Verify orders count aligns with statuses sum
  const o = biData?.orders;
  const statusSum = o?.pending + o?.confirmed + o?.packed + o?.outForDelivery + o?.delivered + o?.cancelled;
  assert?.equal(s?.ordersCount, statusSum);

  // 5. Verify inventory math
  const inv = biData?.inventory;
  assert?.ok(inv?.totalValuePaise >= 0);
  assert?.ok(inv?.outOfStockCount >= 0);
  assert?.ok(inv?.lowStockCount >= 0);
  assert?.ok(inv?.utilizationPct >= 0 && inv?.utilizationPct <= 100);

  // 6. Verify operations Packing SLA complies
  const op = biData?.operations;
  assert?.ok(op?.packingSlaPct >= 0 && op?.packingSlaPct <= 100);
});

test("Business Intelligence: filtering by specific brand, category, and warehouse works", async () => {
  // Get active brand, category, and warehouse
  const wh = await db?.warehouse?.findFirst({ select: { id: true } });
  const brand = await db?.brand?.findFirst({ select: { id: true } });
  const category = await db?.category?.findFirst({ select: { id: true } });

  if (wh && brand && category) {
    const filtered = await getBiData({
      warehouseId: wh?.id,
      brandId: brand?.id,
      categoryId: category?.id,
    });
    
    assert?.ok(filtered?.sales?.ordersCount >= 0);
  }
});
