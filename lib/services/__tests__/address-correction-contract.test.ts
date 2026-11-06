import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { createAddress, listAddresses, updateAddress } from "@/lib/services/addresses";
import { addressInputSchema } from "@/lib/validators";
import { liveTestCityId } from "@/test-support/service-city";

/**
 * What a customer's correction to a pin-filled address does once saved (audit
 * F4, 31 Oct 2026). City and state are tested independently: a city-only save
 * proves nothing about state.
 *
 *   city                     — always the customer's, served pincode or not
 *   state, served pincode    — the pincode's city's state (owner decision after
 *                              the 16 Oct staging bug; place of supply)
 *   state, unserved pincode  — the customer's
 *
 * The forms say the served-pincode rule beside the State field.
 */

const USER = randomUUID();
const SERVED = "999961";
const UNSERVED = "999962";
const none = async () => ({ kind: "no_pincode" as const });
const BASE = { label: "site", name: "QA Correction", phone: "9000000000", line1: "House 1", city: "Srinagar", state: "Jammu and Kashmir" };
let warehouseId = "";
let servedState = "";

before(async () => {
  await db.user.create({ data: { id: USER } });
  const cityId = await liveTestCityId();
  servedState = (await db.serviceCity.findUniqueOrThrow({ where: { id: cityId } })).state;
  warehouseId = (await db.warehouse.create({ data: { name: `ZZZ F4 ${randomUUID().slice(0, 6)}`, city: "Srinagar", pincode: "190001" } })).id;
  await db.serviceablePincode.create({ data: { cityId, pincode: SERVED, warehouseId, isActive: true } });
});
after(async () => {
  await db.address.deleteMany({ where: { userId: USER } });
  await db.serviceablePincode.deleteMany({ where: { pincode: SERVED } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
  await db.user.deleteMany({ where: { id: USER } });
});

const save = (o: Partial<typeof BASE> & { pincode: string }) => createAddress(USER, addressInputSchema.parse({ ...BASE, ...o }), none);
const reopen = async (id: string) => (await listAddresses(USER)).find((a) => a.id === id)!;

test("served pincode: a city-only correction is kept; the state stays the pincode's", async () => {
  const a = await save({ pincode: SERVED, city: "Lal Chowk, Srinagar" });
  const r = await reopen(a.id);
  assert.deepEqual([r.city, r.state], ["Lal Chowk, Srinagar", servedState]);
});

test("served pincode: a state-only correction is replaced by the pincode's state, on create and on edit", async () => {
  const a = await save({ pincode: SERVED, state: "Punjab" });
  assert.deepEqual([(await reopen(a.id)).city, (await reopen(a.id)).state], ["Srinagar", servedState]);
  await updateAddress(USER, a.id, addressInputSchema.parse({ ...BASE, pincode: SERVED, state: "Haryana" }), none);
  assert.equal((await reopen(a.id)).state, servedState);
});

test("unserved pincode: city and state corrections are each kept", async () => {
  const cityOnly = await save({ pincode: UNSERVED, city: "Sopore" });
  assert.deepEqual([(await reopen(cityOnly.id)).city, (await reopen(cityOnly.id)).state], ["Sopore", BASE.state]);
  const stateOnly = await save({ pincode: UNSERVED, state: "Ladakh" });
  assert.deepEqual([(await reopen(stateOnly.id)).city, (await reopen(stateOnly.id)).state], ["Srinagar", "Ladakh"]);
  await updateAddress(USER, stateOnly.id, addressInputSchema.parse({ ...BASE, pincode: UNSERVED, city: "Leh", state: "Ladakh" }), none);
  assert.deepEqual([(await reopen(stateOnly.id)).city, (await reopen(stateOnly.id)).state], ["Leh", "Ladakh"]);
});
