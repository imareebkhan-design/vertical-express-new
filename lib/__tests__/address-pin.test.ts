import test from "node:test";
import assert from "node:assert/strict";
import { areaLine, pinPincodeCheck, pinnedFromAddress, pinnedFromPlace, placeFromPin, withPinnedLocation, type PinnedLocation } from "@/lib/location/address-pin";

/**
 * The split between what Google decided (area, pincode, city, state,
 * coordinates) and what the customer typed (house / flat / floor, landmark,
 * gate instructions). A pinned address must carry its coordinates to the
 * order — they are the tracking destination — and must never overwrite a
 * field the customer filled in.
 */

const PIN: PinnedLocation = {
  label: "Rajbagh",
  formattedAddress: "12 Bund Road, Rajbagh, Srinagar 190008",
  pincode: "190008",
  city: "Srinagar",
  state: "Jammu and Kashmir",
  lat: 34.0681,
  lng: 74.8275,
  placeId: "ChIJ-raj",
};

const TYPED = {
  label: "site" as const,
  name: "Aamir",
  phone: "9000000000",
  line1: "House 12, first floor",
  line2: "",
  landmark: "Opposite the mosque",
  accessNote: "Truck can reach the rear gate",
  city: "Srinagar",
  state: "Jammu & Kashmir",
  pincode: "",
  isDefault: false,
};

test("a pinned address carries the pin's coordinates, pincode and area; the customer's own fields are untouched", () => {
  const saved = withPinnedLocation(TYPED, PIN);
  assert.deepEqual([saved.latitude, saved.longitude, saved.pincode, saved.placeId], [34.0681, 74.8275, "190008", "ChIJ-raj"]);
  assert.equal(saved.line2, "12 Bund Road, Rajbagh");
  assert.equal(saved.state, "Jammu & Kashmir", "city and state in the form are the customer's (pre-filled from the pin, then theirs to correct)");
  assert.deepEqual([saved.line1, saved.landmark, saved.accessNote, saved.name], [TYPED.line1, TYPED.landmark, TYPED.accessNote, TYPED.name]);
});

test("the area line drops the city and pincode the address already stores apart", () => {
  assert.equal(areaLine(PIN), "12 Bund Road, Rajbagh");
  assert.equal(areaLine({ formattedAddress: "Srinagar 190001", pincode: "190001", city: "Srinagar" }), "Srinagar");
  assert.equal(areaLine({ formattedAddress: "x".repeat(400), pincode: "190001", city: null }).length, 160, "fits the line2 column");
});

test("Google not knowing the city or state keeps what the form had", () => {
  const saved = withPinnedLocation(TYPED, { ...PIN, city: null, state: null });
  assert.deepEqual([saved.city, saved.state], ["Srinagar", "Jammu & Kashmir"]);
});

test("an address without coordinates has no pin — it is edited by hand, not shown as mapped", () => {
  assert.equal(pinnedFromAddress({ line2: "Rajbagh", city: "Srinagar", pincode: "190008", latitude: null, longitude: null }), null);
  const back = pinnedFromAddress({ line2: "12 Bund Road, Rajbagh", city: "Srinagar", state: "J&K", pincode: "190008", latitude: 34.06, longitude: 74.82, placeId: "ChIJ-raj" });
  assert.deepEqual([back?.label, back?.formattedAddress, back?.lat, back?.placeId], ["12 Bund Road", "12 Bund Road, Rajbagh, Srinagar 190008", 34.06, "ChIJ-raj"]);
});

test("a new address starts from the place confirmed in the location sheet, and from nothing without one", () => {
  const place = { label: "Rajbagh", formattedAddress: PIN.formattedAddress, lat: PIN.lat, lng: PIN.lng, placeId: "ChIJ-raj" };
  assert.deepEqual(pinnedFromPlace(place, "190008", "Srinagar")?.placeId, "ChIJ-raj");
  assert.equal(pinnedFromPlace(null, "190008", "Srinagar"), null, "a typed pincode alone is not a pin");
  assert.equal(pinnedFromPlace(place, null, null), null);
});

test("a new pin pre-fills only the city and state Google gave; nothing is assumed (issue #1: no silent Srinagar / J&K)", () => {
  assert.deepEqual(placeFromPin(PIN), { city: "Srinagar", state: "Jammu and Kashmir" });
  assert.deepEqual(placeFromPin(null), {});
  const fromSheet = pinnedFromPlace({ label: "CP", formattedAddress: "Connaught Place, New Delhi 110001", lat: 28.63, lng: 77.21, placeId: null }, "110001", "New Delhi");
  assert.deepEqual(placeFromPin(fromSheet), { city: "New Delhi" }, "the location sheet carries no state: the customer types it");
});

test("the customer's correction of a pin's city or state is what is saved; the pin fills only an empty field", () => {
  const corrected = withPinnedLocation({ ...TYPED, city: "Budgam", state: "Jammu and Kashmir" }, PIN);
  assert.equal(corrected.city, "Budgam", "Google said Srinagar; the customer corrected it");
  const empty = withPinnedLocation({ ...TYPED, city: "", state: "  " }, PIN);
  assert.deepEqual([empty.city, empty.state], ["Srinagar", "Jammu and Kashmir"]);
  assert.equal(corrected.pincode, PIN.pincode, "the pincode stays the pin's: correcting it means moving the pin");
});

/* Issue #1, acceptance 7 — the owner keeps a mismatched pin (16 Oct); ops must see it. */
test("pinPincodeCheck reads an order's address snapshot: match, mismatch, unchecked, no pin", () => {
  const pin = { latitude: 34.07, longitude: 74.83 };
  assert.deepEqual(pinPincodeCheck({ ...pin, pincode: "190008", pinPincode: "190008" }), { kind: "match" });
  assert.deepEqual(pinPincodeCheck({ ...pin, pincode: "190008", pinPincode: "190015" }), { kind: "mismatch", pinPincode: "190015" });
  /* Orders placed before 16 Oct, or when Google could not answer, have no recorded pincode — not a mismatch. */
  assert.deepEqual(pinPincodeCheck({ ...pin, pincode: "190008" }), { kind: "unchecked" });
  assert.deepEqual(pinPincodeCheck({ ...pin, pincode: "190008", pinPincode: null }), { kind: "unchecked" });
  assert.deepEqual(pinPincodeCheck({ pincode: "190008", pinPincode: "190015" }), { kind: "no_pin" });
  assert.deepEqual(pinPincodeCheck(null), { kind: "no_pin" });
});
