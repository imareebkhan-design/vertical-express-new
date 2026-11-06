import test from "node:test";
import assert from "node:assert/strict";
import { parseGeocodeResponse, validCoordinates } from "@/lib/geocode-parse";

const c = (long_name: string, ...types: string[]) => ({ long_name, short_name: long_name, types });

test("a Srinagar street resolves to its pincode, locality, city and state", () => {
  const parsed = parseGeocodeResponse({
    status: "OK",
    results: [
      {
        address_components: [
          c("12", "street_number"),
          c("Link Road", "route"),
          c("Hyderpora", "sublocality_level_1", "sublocality", "political"),
          c("Srinagar", "locality", "political"),
          c("Jammu and Kashmir", "administrative_area_level_1", "political"),
          c("190014", "postal_code"),
        ],
      },
    ],
  });
  assert.deepEqual(parsed, {
    kind: "found",
    address: {
      line1: "12, Link Road",
      locality: "Hyderpora",
      city: "Srinagar",
      state: "Jammu and Kashmir",
      pincode: "190014",
    },
  });
});

test("when the most specific result has no postal code, a later one supplies it", () => {
  const parsed = parseGeocodeResponse({
    status: "OK",
    results: [
      { address_components: [c("Old Airport Road", "route"), c("Srinagar", "locality")] },
      { address_components: [c("Rajbagh", "sublocality_level_1"), c("190008", "postal_code")] },
    ],
  });
  assert.equal(parsed.kind, "found");
  if (parsed.kind !== "found") return;
  assert.equal(parsed.address.pincode, "190008");
  assert.equal(parsed.address.line1, "Old Airport Road");
  assert.equal(parsed.address.locality, "Rajbagh");
});

test("a plus code is never offered as a street line", () => {
  const parsed = parseGeocodeResponse({
    status: "OK",
    results: [{ address_components: [c("3QJ7+2F", "premise"), c("190001", "postal_code")] }],
  });
  assert.equal(parsed.kind === "found" && parsed.address.line1, "");
});

test("results with no six-digit pincode are 'no_pincode', never a guessed one", () => {
  assert.deepEqual(parseGeocodeResponse({ status: "ZERO_RESULTS", results: [] }), { kind: "no_pincode" });
  assert.deepEqual(
    parseGeocodeResponse({ status: "OK", results: [{ address_components: [c("India", "country")] }] }),
    { kind: "no_pincode" }
  );
  assert.deepEqual(
    parseGeocodeResponse({ status: "OK", results: [{ address_components: [c("1900", "postal_code")] }] }),
    { kind: "no_pincode" }
  );
});

test("a provider refusal is reported as such, not as an empty result", () => {
  assert.deepEqual(parseGeocodeResponse({ status: "REQUEST_DENIED" }), {
    kind: "provider_error",
    status: "REQUEST_DENIED",
  });
  assert.deepEqual(parseGeocodeResponse({}), { kind: "provider_error", status: "UNKNOWN_ERROR" });
});

test("coordinates are range-checked", () => {
  assert.equal(validCoordinates(34.08, 74.79), true);
  assert.equal(validCoordinates(91, 0), false);
  assert.equal(validCoordinates(0, -181), false);
  assert.equal(validCoordinates(Number.NaN, 1), false);
});
