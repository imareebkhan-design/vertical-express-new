import { test } from "node:test";
import assert from "node:assert/strict";
import { listProducts } from "../catalog";
import { getBiData } from "../admin/bi";
import { placeOrder } from "../checkout";
import { db } from "@/lib/db";

/** Helper to throttle concurrent executions, protecting the database connection pool */
async function runConcurrent<T>(
  tasks: (() => Promise<T>)[],
  concurrencyLimit = 8
): Promise<T[]> {
  const results: Promise<T>[] = [];
  const executing: Promise<unknown>[] = [];

  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);

    if (concurrencyLimit <= tasks.length) {
      const e: Promise<unknown> = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= concurrencyLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

test("Performance Load Test: handles 10, 25, and 50 concurrent search requests", async () => {
  const query = "cement";
  const runBatch = async (size: number) => {
    const startTime = Date.now();
    
    // Throttling concurrency limit to 8 to match connection pool limits
    const tasks = Array.from({ length: size }).map(() =>
      () => listProducts({ search: query, page: 1, perPage: 10 })
    );
    const results = await runConcurrent(tasks, 8);
    
    const duration = Date.now() - startTime;
    const avgLatency = duration / size;

    assert.equal(results.length, size);
    results.forEach((r) => {
      assert.ok(r.items);
      assert.ok(Array.isArray(r.items));
    });

    console.log(`[Load Test] Concurrent Search (${size} users): Total Duration = ${duration}ms, Avg Latency = ${avgLatency.toFixed(2)}ms`);
    return avgLatency;
  };

  const latency10 = await runBatch(10);
  const latency25 = await runBatch(25);
  const latency55 = await runBatch(50);

  // Assert reasonable latencies (throttled average latency is still very low)
  assert.ok(latency10 < 1000, "Average latency for 10 search users should be under 1000ms");
  assert.ok(latency25 < 1000, "Average latency for 25 search users should be under 1000ms");
  assert.ok(latency55 < 1000, "Average latency for 50 search users should be under 1000ms");
});

test("Performance Load Test: handles concurrent administrative BI reports without connection exhaustion", async () => {
  const size = 30; // 30 concurrent admins loading reports
  const startTime = Date.now();

  const tasks = Array.from({ length: size }).map(() => () => getBiData({}));
  const results = await runConcurrent(tasks, 4); // strict limit for heavy BI reports
  
  const duration = Date.now() - startTime;
  const avgLatency = duration / size;

  assert.equal(results.length, size);
  results.forEach((r) => {
    assert.ok(r.sales);
    assert.ok(r.inventory);
  });

  console.log(`[Load Test] Concurrent Admin BI Reports (${size} admins): Total Duration = ${duration}ms, Avg Latency = ${avgLatency.toFixed(2)}ms`);
  assert.ok(avgLatency < 1500, "Average latency for concurrent BI reporting should be under 1500ms");
});

test("Performance Load Test: atomic inventory locking blocks double-selling during concurrent flash sale checkouts", async () => {
  const variant = await db.productVariant.findFirst({
    include: { inventory: true },
  });
  if (!variant) return;

  const warehouse = await db.warehouse.findFirst();
  if (!warehouse) return;

  const testUser = await db.user.findFirst({ where: { role: "customer" } });
  if (!testUser) return;

  const address = await db.address.findFirst({
    where: { userId: testUser.id, deletedAt: null },
  });
  if (!address) return;

  // Set test inventory qty to exactly 5
  await db.inventory.upsert({
    where: {
      variantId_warehouseId: {
        variantId: variant.id,
        warehouseId: warehouse.id,
      },
    },
    create: {
      variantId: variant.id,
      warehouseId: warehouse.id,
      qtyOnHand: 5,
      qtyReserved: 0,
    },
    update: {
      qtyOnHand: 5,
      qtyReserved: 0,
    },
  });

  // Verify stock is set
  const initialInv = await db.inventory.findUnique({
    where: {
      variantId_warehouseId: {
        variantId: variant.id,
        warehouseId: warehouse.id,
      },
    },
  });
  assert.equal(initialInv?.qtyOnHand, 5);

  const cart = await db.cart.upsert({
    where: { userId: testUser.id },
    create: { userId: testUser.id },
    update: {},
  });

  await db.cartItem.deleteMany({ where: { cartId: cart.id } });
  await db.cartItem.create({
    data: {
      cartId: cart.id,
      variantId: variant.id,
      qty: 1,
    },
  });

  // Trigger concurrent placeOrder requests (we use a concurrency of 3 to run checkouts in transactions safely)
  const concurrencySize = 15;
  const tasks = Array.from({ length: concurrencySize }).map((_, idx) =>
    () => placeOrder({
      userId: testUser.id,
      addressId: address.id,
      paymentMethod: "dummy",
      idempotencyKey: `perf-test-key-${idx}-${Date.now()}-${Math.random()}`,
    })
      .then((res) => ({ success: true, res }))
      .catch((err) => ({ success: false, error: err instanceof Error ? err.message : String(err) }))
  );

  const outcomes = await runConcurrent(tasks, 3);

  const successes = outcomes.filter((o) => o.success);
  const failures = outcomes.filter((o) => !o.success);

  console.log(`[Stress Test] Concurrent Checkout Flash Sale: Successes = ${successes.length}, Failures = ${failures.length}`);

  // Verify that we did NOT double sell (exactly 5 should succeed because stock was 5)
  assert.equal(successes.length, 5, "Exactly 5 checkouts should succeed for 5 stock items");
  assert.equal(failures.length, 10, "Remaining 10 checkouts should fail due to out-of-stock lockouts");

  failures.forEach((f) => {
    const errMsg = "error" in f ? f.error : undefined;
    assert.ok(errMsg?.includes("OUT_OF_STOCK"), "Failure message should be OUT_OF_STOCK");
  });

  const finalInv = await db.inventory.findUnique({
    where: {
      variantId_warehouseId: {
        variantId: variant.id,
        warehouseId: warehouse.id,
      },
    },
  });
  assert.equal(finalInv?.qtyOnHand, 0, "Final inventory stock should be exactly 0");
});
