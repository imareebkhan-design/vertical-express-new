import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";

import { db } from "@/lib/db";
import { handlePlaces } from "@/lib/api/places";
import { placesInput, lookupPlace } from "@/lib/services/places";

/**
 * Address search (Places New, via our server): input validation, the
 * suggest/resolve split, and that an unauthenticated or over-quota caller
 * never reaches Google. `lookup` is injected so no test spends a real
 * request or needs a key.
 */

const TOKEN = "token-places";
const UID = `uid-places-${randomUUID().slice(0, 8)}`;
const SESSION = randomUUID();

const verify = async (token: string): Promise<DecodedIdToken | null> =>
  token === TOKEN ? ({ uid: UID } as unknown as DecodedIdToken) : null;

function req(body: unknown): Request {
  return new Request("http://localhost/api/v1/location/places", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
}

async function json(res: Response) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper over an untyped wire body
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

before(async () => {
  await db.user.create({ data: { id: randomUUID(), firebaseUid: UID, phone: `+9198${String(Math.random()).slice(2, 10)}`, profile: { create: {} } } });
});

/* Remove the user this file created (its profile cascades). It was left behind,
   and four admin test files had come to depend on finding it (ISS-069). */
after(async () => {
  await db.user.deleteMany({ where: { firebaseUid: UID } });
});

test("suggest needs a real query and a session UUID", () => {
  assert.equal(placesInput.safeParse({ action: "suggest", query: "ab", session: SESSION }).success, false);
  assert.equal(placesInput.safeParse({ action: "suggest", query: "abc", session: "not-a-uuid" }).success, false);
  assert.equal(placesInput.safeParse({ action: "suggest", query: "abc", session: SESSION }).success, true);
});

test("resolve needs a placeId shaped like one and a session UUID", () => {
  assert.equal(placesInput.safeParse({ action: "resolve", placeId: "has a space", session: SESSION }).success, false);
  assert.equal(placesInput.safeParse({ action: "resolve", placeId: "", session: SESSION }).success, false);
  assert.equal(placesInput.safeParse({ action: "resolve", placeId: "ChIJ_abc-123", session: SESSION }).success, true);
});

test("no bearer token means no lookup call at all", async () => {
  const request = new Request("http://localhost/api/v1/location/places", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "suggest", query: "Hyderpora", session: SESSION }),
  });
  let called = false;
  const res = await json(await handlePlaces(request, { verify }, async () => { called = true; return { kind: "unavailable" as const }; }));
  assert.equal(res.status, 401);
  assert.equal(called, false);
});

test("a malformed body is rejected before it reaches Google", async () => {
  let called = false;
  const res = await json(
    await handlePlaces(req({ action: "suggest", query: "a" }), { verify }, async () => { called = true; return { kind: "unavailable" as const }; })
  );
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, "VALIDATION");
  assert.equal(called, false);
});

test("suggestions come back through, verbatim from the lookup", async () => {
  const res = await json(
    await handlePlaces(req({ action: "suggest", query: "Hyderpora", session: SESSION }), { verify }, async () =>
      ({ kind: "suggestions" as const, suggestions: [{ id: "abc", text: "Hyderpora, Srinagar", main: "Hyderpora", secondary: "Srinagar" }] }))
  );
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.suggestions, [{ id: "abc", text: "Hyderpora, Srinagar", main: "Hyderpora", secondary: "Srinagar" }]);
});

test("a resolved place carries its coordinate and address through", async () => {
  const res = await json(
    await handlePlaces(req({ action: "resolve", placeId: "abc", session: SESSION }), { verify }, async () => ({
      kind: "place" as const,
      coordinate: { latitude: 34.083, longitude: 74.797 },
      address: { line1: "Hyderpora", locality: "Srinagar", city: "Srinagar", state: "Jammu and Kashmir", pincode: "190014" },
    }))
  );
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.coordinate, { latitude: 34.083, longitude: 74.797 });
  assert.equal(res.body.data.address.pincode, "190014");
});

test("Google being unreachable becomes a pincode-fallback message, not a 500", async () => {
  const res = await json(
    await handlePlaces(req({ action: "suggest", query: "Hyderpora", session: SESSION }), { verify }, async () => ({ kind: "unavailable" as const }))
  );
  assert.equal(res.status, 503);
  assert.match(res.body.error.message, /pincode/);
});

test("a caller cannot exceed 30 address searches a minute", async () => {
  const lookup = async () => ({ kind: "suggestions" as const, suggestions: [] });
  let lastStatus = 200;
  for (let i = 0; i < 31; i++) {
    const res = await handlePlaces(req({ action: "suggest", query: `Query ${i}`, session: SESSION }), { verify }, lookup);
    lastStatus = res.status;
  }
  assert.equal(lastStatus, 429);
});

/**
 * `lookupPlace` itself, against response shapes captured from the real
 * Places API (New) — not the injected-lookup route tests above.
 *
 * REGRESSION: a real Srinagar address resolved via a live smoke test came
 * back "unavailable" even though Google's response plainly carried a pincode.
 * Google's `AddressComponent.types` can be absent entirely (an untyped
 * free-text line like "Peerbagh naddirgund" sits next to a properly typed
 * `postal_code` component in the same array) — a schema that required
 * `types` on every component failed the whole address the moment one
 * component lacked it.
 */
function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;
}

const REAL_RESOLVE_RESPONSE = {
  addressComponents: [
    { longText: "Peerbagh naddirgund", languageCode: "en" },
    { longText: "Hyderpora", shortText: "Hyderpora", types: ["sublocality_level_1", "sublocality", "political"], languageCode: "en" },
    { longText: "Srinagar", shortText: "Srinagar", types: ["locality", "political"], languageCode: "en" },
    { longText: "190014", shortText: "190014", types: ["postal_code"], languageCode: "en-US" },
  ],
  location: { latitude: 34.0507375, longitude: 74.7862031 },
};

test("a component with no types field does not discard an otherwise-resolvable address", async () => {
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
  const result = await lookupPlace({ action: "resolve", placeId: "abc", session: SESSION }, fakeFetch(200, REAL_RESOLVE_RESPONSE));
  assert.equal(result.kind, "place");
  assert.equal(result.kind === "place" ? result.address?.pincode : null, "190014");
  assert.deepEqual(result.kind === "place" ? result.coordinate : null, { latitude: 34.0507375, longitude: 74.7862031 });
});

test("a non-OK response from Google is unavailable, not a crash", async () => {
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
  const result = await lookupPlace({ action: "resolve", placeId: "abc", session: SESSION }, fakeFetch(403, {}));
  assert.equal(result.kind, "unavailable");
});

test("a body that does not match the expected shape is unavailable, not a crash", async () => {
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
  const result = await lookupPlace({ action: "resolve", placeId: "abc", session: SESSION }, fakeFetch(200, { nonsense: true }));
  assert.equal(result.kind, "unavailable");
});

/** Captures the request so the body Google receives can be checked. */
function capturingFetch(body: unknown) {
  const sent: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
  return { sent, impl };
}

test("suggestions carry Google's two-line split, and only the fields the dropdown shows are asked for", async () => {
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
  const { sent, impl } = capturingFetch({
    suggestions: [
      { placePrediction: { placeId: "p1", text: { text: "19 Raj Niwas Marg, Civil Lines, Delhi" }, structuredFormat: { mainText: { text: "19 Raj Niwas Marg" }, secondaryText: { text: "Civil Lines, Delhi" } } } },
      { placePrediction: { placeId: "p2", text: { text: "Rajbagh, Srinagar" } } },
    ],
  });
  const result = await lookupPlace({ action: "suggest", query: "19 Raj", session: SESSION }, impl);
  assert.equal(result.kind, "suggestions");
  assert.deepEqual(result.kind === "suggestions" ? result.suggestions : null, [
    { id: "p1", text: "19 Raj Niwas Marg, Civil Lines, Delhi", main: "19 Raj Niwas Marg", secondary: "Civil Lines, Delhi" },
    { id: "p2", text: "Rajbagh, Srinagar", main: "Rajbagh, Srinagar", secondary: null },
  ]);
  const headers = sent[0].init.headers as Record<string, string>;
  assert.equal(headers["X-Goog-FieldMask"], "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat");
  const body = JSON.parse(String(sent[0].init.body));
  assert.equal(body.sessionToken, SESSION);
  assert.ok(body.locationBias, "a bias");
  assert.equal(body.locationRestriction, undefined, "never a restriction: serviceability decides delivery, not the search box");
  assert.deepEqual(body.locationBias.circle.center, { latitude: 34.0837, longitude: 74.7973 }, "Srinagar by default");
});

test("a shared device position tightens the bias around the customer", async () => {
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
  const { sent, impl } = capturingFetch({ suggestions: [] });
  await lookupPlace({ action: "suggest", query: "Rajbagh", session: SESSION, near: { lat: 34.07, lng: 74.83 } }, impl);
  const body = JSON.parse(String(sent[0].init.body));
  assert.deepEqual(body.locationBias.circle.center, { latitude: 34.07, longitude: 74.83 });
});

test("resolve asks for coordinates and address parts only, inside the same session", async () => {
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
  const { sent, impl } = capturingFetch(REAL_RESOLVE_RESPONSE);
  await lookupPlace({ action: "resolve", placeId: "abc", session: SESSION }, impl);
  assert.match(sent[0].url, new RegExp(`sessionToken=${SESSION}`));
  assert.equal((sent[0].init.headers as Record<string, string>)["X-Goog-FieldMask"], "location,addressComponents");
});
