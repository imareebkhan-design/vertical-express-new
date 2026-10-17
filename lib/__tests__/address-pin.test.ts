import test from "node:test";
import assert from "node:assert/strict";
import { areaLine, missingPlaceField, pinnedFromAddress, pinnedFromPlace, withPinnedLocation, withPlaceFields, type PinnedLocation } from "@/lib/location/address-pin";

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
  assert.equal(saved.state, "Jammu & Kashmir", "the state in the form — the pin's, or the customer's correction of it — is what is saved");
  assert.deepEqual([saved.line1, saved.landmark, saved.accessNote, saved.name], [TYPED.line1, TYPED.landmark, TYPED.accessNote, TYPED.name]);
});

test("the area line drops the city and pincode the address already stores apart", () => {
  assert.equal(areaLine(PIN), "12 Bund Road, Rajbagh");
  assert.equal(areaLine({ formattedAddress: "Srinagar 190001", pincode: "190001", city: "Srinagar" }), "Srinagar");
  assert.equal(areaLine({ formattedAddress: "x".repeat(400), pincode: "190001", city: null }).length, 160, "fits the line2 column");
});

test("a form with no city or state takes the pin's", () => {
  const saved = withPinnedLocation({ ...TYPED, city: "", state: "" }, PIN);
  assert.deepEqual([saved.city, saved.state], ["Srinagar", "Jammu and Kashmir"]);
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

/* Issue #1: the forms used to start from a hard-coded "Srinagar" / "Jammu &
   Kashmir" and hide both fields when a pin was set, so a place with no state
   saved one the customer never saw. */

test("a confirmed pin fills city and state into the form, where it knows them", () => {
  assert.deepEqual(withPlaceFields({ city: "", state: "" }, PIN), { city: "Srinagar", state: "Jammu and Kashmir" });
  assert.deepEqual(withPlaceFields({ city: "", state: "" }, { ...PIN, state: null }), { city: "Srinagar", state: "" }, "no state is guessed");
  assert.deepEqual(withPlaceFields({ city: "Sgr", state: "J&K" }, { ...PIN, city: null, state: "  " }), { city: "Sgr", state: "J&K" });
  assert.deepEqual(withPlaceFields({ city: "", state: "" }, null), { city: "", state: "" });
});

test("city and state are both required before saving", () => {
  assert.equal(missingPlaceField({ city: "", state: "" }), "city");
  assert.equal(missingPlaceField({ city: "Srinagar", state: " " }), "state");
  assert.equal(missingPlaceField({ city: "Srinagar", state: "Jammu & Kashmir" }), null);
});

test("the location sheet's place carries its state to a new address, and an older saved place carries none", () => {
  const place = { label: "Rajbagh", formattedAddress: PIN.formattedAddress, lat: PIN.lat, lng: PIN.lng, placeId: "ChIJ-raj" };
  assert.equal(pinnedFromPlace({ ...place, state: "Jammu and Kashmir" }, "190008", "Srinagar")?.state, "Jammu and Kashmir");
  assert.equal(pinnedFromPlace(place, "190008", "Srinagar")?.state, null);
});
