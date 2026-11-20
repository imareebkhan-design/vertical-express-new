import test from "node:test";
import assert from "node:assert/strict";
import { announceAuthChanged, onAuthChanged } from "@/lib/auth/auth-events";

/**
 * E8 — sign-in and sign-out tell per-customer client state (the cart) to
 * re-fetch. The cart provider subscribes with `onAuthChanged`; sign-in
 * (`use-firebase-sign-in`) and both sign-outs (`sign-out-client`) announce.
 */

test("an announcement reaches every subscriber, and unsubscribing stops it", () => {
  let a = 0;
  let b = 0;
  const offA = onAuthChanged(() => a++);
  const offB = onAuthChanged(() => b++);
  announceAuthChanged();
  assert.deepEqual([a, b], [1, 1]);
  offA();
  announceAuthChanged();
  assert.deepEqual([a, b], [1, 2]);
  offB();
  announceAuthChanged();
  assert.deepEqual([a, b], [1, 2]);
});
