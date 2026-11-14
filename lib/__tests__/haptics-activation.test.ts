import { test } from "node:test";
import assert from "node:assert/strict";
import { canVibrateNow } from "../native/haptics";

/** A buzz before the first tap is blocked by the browser and logged as an error. */
test("no vibration before the person has interacted with the page", () => {
  assert.equal(canVibrateNow({ userActivation: { hasBeenActive: false } } as unknown as Navigator), false);
});

test("vibration after interaction, and where the browser cannot tell", () => {
  assert.equal(canVibrateNow({ userActivation: { hasBeenActive: true } } as unknown as Navigator), true);
  assert.equal(canVibrateNow({} as Navigator), true);
});
