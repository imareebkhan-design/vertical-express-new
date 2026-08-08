import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { addItem, updateItemQty, getCartSummary, resolveWarehouseId } from "../cart";
import { randomUUID } from "crypto";

// Test-wide unique keys to prevent collision
const TEST_PINCODE_1 = "999901";
const TEST_PINCODE_2 = "999902";
const TEST_USER_1 = randomUUID();
const TEST_USER_2 = randomUUID();

let categoryId: string;
let brandId: string;
let warehouseId1: string;
let warehouseId2: string;
let productId: string;
let variantId: string;

before(async () => {
  // 1. Fetch an existing category and brand to attach the test product to
  const existingCat = await db.category.findFirst({ select: { id: true } });
  if (!existingCat) {
    throw new Error("No categories found in seed to attach test product to.");
  }
  categoryId = existingCat.id;

  const existingBrand = await db.brand.findFirst({ select: { id: true } });
  if (!existingBrand) {
    throw new Error("No brands found in seed to attach test product to.");
  }
  brandId = existingBrand.id;

  // 2. Insert test user records
  await db.user.createMany({
    data: [
      {
        id: TEST_USER_1,
        phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        email: `test1_${randomUUID()}@example.com`,
      },
      {
        id: TEST_USER_2,
        phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        email: `test2_${randomUUID()}@example.com`,
      },
    ],
  });

  // 3. Insert test warehouses
  const wh1 = await db.warehouse.create({
    data: { name: "Test Warehouse 1", city: "Srinagar", pincode: "190001" },
  });
  warehouseId1 = wh1.id;

  const wh2 = await db.warehouse.create({
    data: { name: "Test Warehouse 2", city: "Jammu", pincode: "180001" },
  });
  warehouseId2 = wh2.id;

  // 4. Insert test serviceable pincodes mapping to warehouses
  await db.serviceablePincode.createMany({
    data: [
      { pincode: TEST_PINCODE_1, warehouseId: warehouseId1, isActive: true },
      { pincode: TEST_PINCODE_2, warehouseId: warehouseId2, isActive: true },
    ],
  });

  // 5. Insert test user addresses mapping them to pincodes
  await db.address.createMany({
    data: [
      {
        userId: TEST_USER_1,
        name: "Buyer One",
        phone: "9876543210",
        line1: "Sector 1",
        city: "City One",
        state: "State One",
        pincode: TEST_PINCODE_1,
        isDefault: true,
      },
      {
        userId: TEST_USER_2,
        name: "Buyer Two",
        phone: "9876543210",
        line1: "Sector 2",
        city: "City Two",
        state: "State Two",
        pincode: TEST_PINCODE_2,
        isDefault: true,
      },
    ],
  });

  // 6. Create test product & variant
  const prod = await db.product.create({
    data: {
      title: "Test Cement Bag",
      slug: `test-cement-${Date.now()}`,
      description: "Test description",
      categoryId,
      brandId,
    },
  });
  productId = prod.id;

  const v = await db.productVariant.create({
    data: {
      productId,
      name: "50kg Bag",
      sku: `SKU-TEST-${Date.now()}`,
      pricePaise: 35000,
    },
  });
  variantId = v.id;

  // 7. Seed stock:
  // Warehouse 1 (User 1) has 10 items
  // Warehouse 2 (User 2) has 0 items (out of stock)
  await db.inventory.createMany({
    data: [
      { variantId, warehouseId: warehouseId1, qtyOnHand: 10, qtyReserved: 0 },
      { variantId, warehouseId: warehouseId2, qtyOnHand: 0, qtyReserved: 0 },
    ],
  });
});

after(async () => {
  // Cleanup all records created during test execution
  await db.cartItem.deleteMany({
    where: {
      cart: { userId: { in: [TEST_USER_1, TEST_USER_2] } },
    },
  });
  await db.cart.deleteMany({
    where: { userId: { in: [TEST_USER_1, TEST_USER_2] } },
  });
  await db.address.deleteMany({
    where: { userId: { in: [TEST_USER_1, TEST_USER_2] } },
  });
  await db.serviceablePincode.deleteMany({
    where: { pincode: { in: [TEST_PINCODE_1, TEST_PINCODE_2] } },
  });
  if (variantId) {
    await db.inventory.deleteMany({
      where: { variantId },
    });
    await db.productVariant.delete({
      where: { id: variantId },
    });
  }
  if (productId) {
    await db.product.delete({
      where: { id: productId },
    });
  }
  const whIds = [warehouseId1, warehouseId2].filter(Boolean) as string[];
  if (whIds.length > 0) {
    await db.warehouse.deleteMany({
      where: { id: { in: whIds } },
    });
  }
  // Delete users last
  await db.user.deleteMany({
    where: { id: { in: [TEST_USER_1, TEST_USER_2] } },
  });
});

test("Cart Inventory: resolveWarehouseId maps users to correct warehouse based on address", async () => {
  const resolved1 = await resolveWarehouseId(TEST_USER_1);
  const resolved2 = await resolveWarehouseId(TEST_USER_2);

  assert.equal(resolved1, warehouseId1);
  assert.equal(resolved2, warehouseId2);
});

test("Cart Inventory: addItem allows additions within stock limits", async () => {
  // User 1 has 10 units of stock available in Warehouse 1. Add 5.
  await addItem(TEST_USER_1, null, variantId, 5);

  const cart = await getCartSummary(TEST_USER_1, null);
  assert.equal(cart.lines.length, 1);
  assert.equal(cart.lines[0].qty, 5);
  assert.equal(cart.lines[0].inStock, true);
});

test("Cart Inventory: addItem throws ONLY_X_LEFT when adding beyond stock", async () => {
  // User 1 currently has 5 in cart. Adding another 6 requests 11 total, exceeding 10.
  await assert.rejects(
    async () => {
      await addItem(TEST_USER_1, null, variantId, 6);
    },
    (err: Error) => {
      return err.message.startsWith("ONLY_X_LEFT") && err.message.includes("Only 10 items are available");
    }
  );
});

test("Cart Inventory: addItem throws OUT_OF_STOCK when warehouse stock is 0", async () => {
  // User 2's warehouse (Warehouse 2) has 0 units in stock.
  await assert.rejects(
    async () => {
      await addItem(TEST_USER_2, null, variantId, 1);
    },
    (err: Error) => {
      return err.message.startsWith("OUT_OF_STOCK") && err.message.includes("This item is currently unavailable");
    }
  );
});

test("Cart Inventory: updateItemQty clamps quantities to available stock limit", async () => {
  // User 1 currently has 5 in cart. Try to update quantity to 20 (exceeds available 10).
  const cartLine = await db.cartItem.findFirst({
    where: { cart: { userId: TEST_USER_1 }, variantId },
  });
  assert.ok(cartLine);

  const result = await updateItemQty(TEST_USER_1, null, cartLine.id, 20);

  // Assert quantity is clamped to 10
  assert.equal(result.summary.lines[0].qty, 10);
  assert.equal(result.summary.lines[0].inStock, true);
  assert.ok(result.adjustment);
  assert.equal(result.adjustment.status, "limited");
  assert.equal(result.adjustment.available, 10);
});

test("Cart Inventory: updateItemQty clamps to 1 and marks out_of_stock when available is 0", async () => {
  // Set Warehouse 1 stock to 0
  await db.inventory.update({
    where: { variantId_warehouseId: { variantId, warehouseId: warehouseId1 } },
    data: { qtyOnHand: 0 },
  });

  const cartLine = await db.cartItem.findFirst({
    where: { cart: { userId: TEST_USER_1 }, variantId },
  });
  assert.ok(cartLine);

  // Try updating to 5 when available is 0
  const result = await updateItemQty(TEST_USER_1, null, cartLine.id, 5);

  assert.equal(result.summary.lines[0].qty, 1); // clamps to 1 in DB
  assert.equal(result.summary.lines[0].inStock, false); // marked out of stock
  assert.ok(result.adjustment);
  assert.equal(result.adjustment.status, "out_of_stock");
});

test("Cart Inventory: getCartSummary (cart refresh) auto-clamps quantity when stock drops", async () => {
  // Restore Warehouse 1 stock to 4 units
  await db.inventory.update({
    where: { variantId_warehouseId: { variantId, warehouseId: warehouseId1 } },
    data: { qtyOnHand: 4 },
  });

  // Manually update cart item quantity directly to 8 in the database (bypassing logic checks)
  const cartItem = await db.cartItem.findFirst({
    where: { cart: { userId: TEST_USER_1 }, variantId },
  });
  assert.ok(cartItem);
  await db.cartItem.update({
    where: { id: cartItem.id },
    data: { qty: 8 },
  });

  // Fetch summary — should trigger automatic clamping on refresh
  const summary = await getCartSummary(TEST_USER_1, null);

  assert.equal(summary.lines[0].qty, 4); // clamped to 4
  assert.equal(summary.lines[0].adjusted, true);
  assert.equal(summary.lines[0].adjustmentReason, "limited");
  assert.equal(summary.lines[0].inStock, true);
});
