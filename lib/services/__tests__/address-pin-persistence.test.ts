import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createAddress, updateAddress } from "@/lib/services/addresses";
import { addressInputSchema } from "@/lib/validators";

/**
 * A saved address keeps its pin — coordinates and, from search, the Google
 * place id — and loses all three together when edited without one. The pin is
 * the order's tracking destination; a stale place id on an address the
 * customer moved would point the next re-resolve at the old gate.
 */

const USER = randomUUID();

before(async () => {
  await db.user.create({ data: { id: USER, phone: `+9197${String(Math.random()).slice(2, 10)}`, profile: { create: {} } } });
});
after(async () => {
  await db.address.deleteMany({ where: { userId: USER } });
  await db.user.deleteMany({ where: { id: USER } });
});

const BASE = {
  label: "site",
  name: "QA Pin",
  phone: "9000000000",
  line1: "House 12, first floor",
  line2: "12 Bund Road, Rajbagh",
  city: "Srinagar",
  state: "Jammu and Kashmir",
  pincode: "190008",
};

test("a pinned address stores coordinates and place id; a text-only edit clears all three", async () => {
  const input = addressInputSchema.parse({ ...BASE, latitude: 34.0662, longitude: 74.8288, placeId: "ChIJ-rajbagh_1" });
  const created = await createAddress(USER, input);
  const row = await db.address.findUniqueOrThrow({ where: { id: created.id } });
  assert.deepEqual([row.latitude, row.longitude, row.placeId], [34.0662, 74.8288, "ChIJ-rajbagh_1"]);

  const edited = addressInputSchema.parse({ ...BASE, line1: "House 14" });
  await updateAddress(USER, created.id, edited);
  const after = await db.address.findUniqueOrThrow({ where: { id: created.id } });
  assert.deepEqual([after.latitude, after.longitude, after.placeId], [null, null, null]);
});

test("a place id without coordinates is never kept", async () => {
  const input = addressInputSchema.parse({ ...BASE, placeId: "ChIJ-orphan" });
  const created = await createAddress(USER, input);
  const row = await db.address.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(row.placeId, null);
});

test("a place id that is not shaped like one is refused at the boundary", () => {
  assert.equal(addressInputSchema.safeParse({ ...BASE, latitude: 34, longitude: 74, placeId: "has space" }).success, false);
  assert.equal(addressInputSchema.safeParse({ ...BASE, latitude: 34, longitude: 74, placeId: "x".repeat(256) }).success, false);
});

test("a served pincode's state wins over the form's pre-filled one; an unserved pincode keeps what was entered", async () => {
  const city = await db.serviceCity.create({ data: { name: `ZZZ Addr City ${randomUUID().slice(0, 6)}`, state: "Delhi", isLive: true } });
  const wh = await db.warehouse.findFirstOrThrow({ select: { id: true } });
  await db.serviceablePincode.create({ data: { pincode: "999981", cityId: city.id, warehouseId: wh.id, isActive: true } });
  try {
    const served = await createAddress(USER, addressInputSchema.parse({ ...BASE, city: "New Delhi", pincode: "999981", state: "Jammu & Kashmir" }));
    assert.equal(served.state, "Delhi");
    const edited = await updateAddress(USER, served.id, addressInputSchema.parse({ ...BASE, city: "New Delhi", pincode: "999981", state: "Jammu & Kashmir" }));
    assert.equal(edited?.state, "Delhi", "an edit cannot put it back");
    const unserved = await createAddress(USER, addressInputSchema.parse({ ...BASE, pincode: "999982", state: "Somewhere" }));
    assert.equal(unserved.state, "Somewhere");
  } finally {
    await db.address.deleteMany({ where: { userId: USER, pincode: { in: ["999981", "999982"] } } });
    await db.serviceablePincode.deleteMany({ where: { pincode: "999981" } });
    await db.serviceCity.delete({ where: { id: city.id } });
  }
});
