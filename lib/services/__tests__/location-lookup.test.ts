import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { db } from "@/lib/db";
import { GEOCODE_LIMIT, lookUpLocation } from "@/lib/services/location-lookup";
import { locationLookupResult } from "@/lib/location-lookup-result";
import { handleReverseGeocode } from "@/lib/api/v1";
import type { ParsedGeocode } from "@/lib/geocode-parse";

/**
 * W-15: GPS → pincode for the web, through the same lookup the native app's
 * `/api/v1/location/reverse` uses. Google is stubbed; serviceability is the
 * real `ServiceablePincode` table, and the rate limit is the real limiter —
 * the point is that both transports give one answer and share one budget.
 */

const PIN_SERVED = "999923";
const PIN_UNSERVED = "999922";
const UID = `uid-loc-${randomUUID().slice(0, 8)}`;
const TOKEN = "token-loc";

let userId: string;
let warehouseId: string;

const at = (pincode: string) => {
  let calls = 0;
  const geocode = async (): Promise<ParsedGeocode> => {
    calls++;
    return {
      kind: "found",
      address: { line1: "12, Link Road", locality: "Hyderpora", city: "Srinagar", state: "Jammu and Kashmir", pincode },
    };
  };
  return { geocode, calls: () => calls };
};

const verify = async (token: string): Promise<DecodedIdToken | null> =>
  token === TOKEN ? ({ uid: UID } as unknown as DecodedIdToken) : null;

const clearBudget = () => db.rateLimit.deleteMany({ where: { bucket: `api-geo:${userId}` } });

before(async () => {
  const warehouse = await db.warehouse.create({ data: { name: "ZZZ Loc Warehouse", city: "Srinagar", pincode: "190001" } });
  warehouseId = warehouse.id;
  await db.serviceablePincode.create({
    data: { pincode: PIN_SERVED, warehouseId, isActive: true, etaMinutes: 90, deliveryFeePaise: 4000, codAllowed: false },
  });
  userId = (
    await db.user.create({
      data: { id: randomUUID(), firebaseUid: UID, phone: `+9196${String(Math.random()).slice(2, 10)}`, profile: { create: {} } },
      select: { id: true },
    })
  ).id;
});

after(async () => {
  await clearBudget();
  await db.profile.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.serviceablePincode.deleteMany({ where: { pincode: PIN_SERVED } });
  await db.warehouse.deleteMany({ where: { id: warehouseId } });
});

test("Google supplies the pincode; ServiceablePincode alone decides delivery", async () => {
  await clearBudget();
  const served = await lookUpLocation(userId, 34.07, 74.8, at(PIN_SERVED).geocode);
  assert.equal(served.kind, "found");
  assert.ok(served.kind === "found");
  assert.equal(served.address.pincode, PIN_SERVED);
  assert.deepEqual(served.serviceability, { serviceable: true, etaMinutes: 90, deliveryFeePaise: 4000, codAllowed: false });

  const unserved = await lookUpLocation(userId, 34.07, 74.8, at(PIN_UNSERVED).geocode);
  assert.ok(unserved.kind === "found");
  assert.equal(unserved.address.pincode, PIN_UNSERVED, "the geocoder's pincode is reported, never swapped for a served one");
  assert.equal(unserved.serviceability.serviceable, false);
});

test("failures are distinct, and none of them produces a pincode", async () => {
  await clearBudget();
  const geo = at(PIN_SERVED);
  for (const [lat, lng] of [[NaN, 74.8], [34.07, NaN], [91, 0], [0, 181]]) {
    assert.deepEqual(await lookUpLocation(userId, lat, lng, geo.geocode), { kind: "invalid_coordinates" });
  }
  assert.equal(geo.calls(), 0, "invalid coordinates never reach Google");

  assert.deepEqual(await lookUpLocation(userId, 34, 74, async () => ({ kind: "no_pincode" })), { kind: "no_pincode" });
  assert.deepEqual(
    await lookUpLocation(userId, 34, 74, async () => ({ kind: "provider_error", status: "NOT_CONFIGURED" })),
    { kind: "provider_error", status: "NOT_CONFIGURED" }
  );
});

test("the web and the native route share one per-user budget, and a refusal does not call Google", async () => {
  await clearBudget();
  const geo = at(PIN_SERVED);
  for (let i = 0; i < GEOCODE_LIMIT.hits; i++) {
    assert.equal((await lookUpLocation(userId, 34.07, 74.8, geo.geocode)).kind, "found");
  }
  assert.equal(geo.calls(), GEOCODE_LIMIT.hits);

  const refused = await lookUpLocation(userId, 34.07, 74.8, geo.geocode);
  assert.equal(refused.kind, "rate_limited");
  assert.equal(geo.calls(), GEOCODE_LIMIT.hits, "no Google call once the budget is spent");

  /* The native app's route, same customer: already out of budget. */
  const native = await handleReverseGeocode(new Request("http://localhost/x?lat=34.07&lng=74.8", {
    headers: { authorization: `Bearer ${TOKEN}` },
  }), { verify, geocode: geo.geocode });
  assert.equal(native.status, 429);
  assert.equal(geo.calls(), GEOCODE_LIMIT.hits);
});

test("the web action's answer: a pincode to confirm, or a reason that points to typing it", () => {
  const address = { line1: "", locality: "Hyderpora", city: "Srinagar", state: null, pincode: PIN_SERVED };
  assert.deepEqual(
    locationLookupResult({
      kind: "found",
      address,
      serviceability: { serviceable: false, etaMinutes: null, deliveryFeePaise: null, codAllowed: false },
    }),
    { ok: true, data: { pincode: PIN_SERVED, locality: "Hyderpora", serviceable: false } }
  );

  const failures = [
    { kind: "rate_limited", retryAfterMs: 1000 },
    { kind: "invalid_coordinates" },
    { kind: "no_pincode" },
    { kind: "provider_error", status: "HTTP_500" },
  ] as const;
  const codes = failures.map((f) => {
    const r = locationLookupResult(f);
    assert.equal(r.ok, false);
    assert.ok(!r.ok);
    assert.match(r.error.message, /pincode/i, "every failure sends the customer to the typed path");
    return r.error.code;
  });
  assert.deepEqual(codes, ["RATE_LIMITED", "VALIDATION", "NOT_FOUND", "UNAVAILABLE"]);
});
