import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { getCartSummary, addItem } from "../cart";
import { computeTotals, placeOrder } from "../checkout";
import { getPaymentProvider } from "../payments";
import { createApprovedCatalogueFixture } from "@/test-support/catalogue-fixtures";
import { liveTestCityId } from "@/test-support/service-city";

test("checkout quotes and sells only the serving warehouse's unreserved units", { timeout: 30000 }, async (t) => {
  const fixture = await createApprovedCatalogueFixture();
  const variantId = fixture.variant.id;
  const inventory = await db.inventory.findFirstOrThrow({ where: { variantId } });
  const pincode = String(randomInt(990000, 999999));
  const serviceablePincodeId = randomUUID();
  const users = [randomUUID(), randomUUID()];
  const coupon = await db.coupon.create({ data: { code: `R${randomUUID().slice(0, 8).toUpperCase()}`, type: "flat", value: 100 } });
  t.after(async () => {
    await db.stockMovement.deleteMany({ where: { variantId } });
    await db.order.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.coupon.delete({ where: { id: coupon.id } });
    await db.serviceablePincode.deleteMany({ where: { id: serviceablePincodeId } });
    await fixture.cleanup();
  });
  await db.serviceablePincode.create({ data: { id: serviceablePincodeId, pincode, cityId: await liveTestCityId(), warehouseId: inventory.warehouseId } });
  const addresses: string[] = [];
  for (const userId of users) {
    await db.user.create({ data: { id: userId } });
    const address = await db.address.create({ data: {
      userId, name: "Reserve test", phone: "9876543210", line1: "Test site", city: "Srinagar", state: "Jammu & Kashmir", pincode,
    } });
    addresses.push(address.id);
    await addItem(userId, null, variantId, 1);
  }
  const where = { id: inventory.id };
  const cart = await getCartSummary(users[0], null);
  await db.inventory.update({ where, data: { qtyOnHand: 1, qtyReserved: 2 } });
  const quote = async (qty: number) => computeTotals({ ...cart, lines: [{ ...cart.lines[0], qty }] }, pincode);
  assert.deepEqual((await quote(1)).unavailableLines, [fixture.product.title]);
  // Commercial readiness excludes an inconsistent inventory row from the cart.
  await assert.rejects(placeOrder({ userId: users[0], addressId: addresses[0], paymentMethod: "dummy" }), /CART_EMPTY/);

  await db.inventory.update({ where, data: { qtyOnHand: 3 } });
  assert.deepEqual((await quote(1)).unavailableLines, []);
  assert.deepEqual((await quote(2)).unavailableLines, [fixture.product.title]);

  // Both customers have reached the gateway with a valid quote before either sale starts.
  const provider = getPaymentProvider("dummy");
  const createOrder = provider.createOrder.bind(provider);
  let arrived = 0;
  let release!: () => void;
  const bothReady = new Promise<void>((resolve) => { release = resolve; });
  t.mock.method(provider, "createOrder", async (...args: Parameters<typeof createOrder>) => {
    if (++arrived === users.length) release();
    await bothReady;
    return createOrder(...args);
  });
  const results = await Promise.allSettled(users.map((userId, i) => placeOrder({
    userId, addressId: addresses[i], paymentMethod: "dummy", couponCode: coupon.code,
  })));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const refused = results.find(r => r.status === "rejected");
  assert.match(String(refused?.reason), /OUT_OF_STOCK/);
  assert.equal(await db.order.count({ where: { userId: { in: users } } }), 1);
  assert.deepEqual(await db.inventory.findUniqueOrThrow({ where, select: { qtyOnHand: true, qtyReserved: true } }), { qtyOnHand: 2, qtyReserved: 2 });
  assert.deepEqual(await db.stockMovement.findMany({ where: { variantId }, select: { qtyDelta: true, reason: true } }), [{ qtyDelta: -1, reason: "sold" }]);
  assert.equal(await db.couponRedemption.count({ where: { couponId: coupon.id } }), 1);
  assert.equal((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redeemedCount, 1);
});
