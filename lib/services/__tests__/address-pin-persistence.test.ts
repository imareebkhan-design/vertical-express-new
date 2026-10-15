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
