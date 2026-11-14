import test from "node:test";
import assert from "node:assert/strict";
import { parseServicePincodes, MAX_PINCODE_RANGE } from "@/lib/pincode";

test("lists, ranges, de-duplication", () => {
  const r = parseServicePincodes("110054, 110001\n110003-110005 110054");
  assert.deepEqual(r.valid, ["110054", "110001", "110003", "110004", "110005"]);
  assert.deepEqual(r.invalid, []);
});

test("bad tokens and oversized or backwards ranges are reported, not applied", () => {
  const r = parseServicePincodes("11005 012345 110010-110001 110001-119999");
  assert.deepEqual(r.valid, []);
  assert.deepEqual(r.invalid, ["11005", "012345", "110010-110001"]);
  assert.deepEqual(r.tooLarge, ["110001-119999"]);
  assert.ok(MAX_PINCODE_RANGE <= 200);
});
