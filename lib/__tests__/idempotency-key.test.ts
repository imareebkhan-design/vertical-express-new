import test from "node:test";
import assert from "node:assert/strict";
import { generateIdempotencyKey } from "@/lib/idempotency-key";

/**
 * ISS-108: the checkout idempotency key used to fall back to Math.random when
 * crypto.randomUUID was missing. The fallback must stay cryptographic.
 */

test("uses randomUUID when it exists", () => {
  const key = generateIdempotencyKey({ randomUUID: () => "uuid-from-crypto", getRandomValues: () => { throw new Error("not used"); } } as never);
  assert.equal(key, "uuid-from-crypto");
});

test("without randomUUID it uses getRandomValues for 16 bytes, hex encoded", () => {
  let requested = 0;
  const fake = {
    getRandomValues<T extends ArrayBufferView | null>(arr: T): T {
      const bytes = arr as unknown as Uint8Array;
      requested = bytes.length;
      bytes.forEach((_, i) => (bytes[i] = i * 17));
      return arr;
    },
  };
  const key = generateIdempotencyKey(fake);
  assert.equal(requested, 16);
  assert.equal(key, Array.from({ length: 16 }, (_, i) => ((i * 17) & 0xff).toString(16).padStart(2, "0")).join(""));
  assert.match(key, /^[0-9a-f]{32}$/);
});

test("the fallback never consults Math.random", () => {
  const original = Math.random;
  Math.random = () => {
    throw new Error("Math.random must not be used for an idempotency key");
  };
  try {
    const key = generateIdempotencyKey({ getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    assert.match(key, /^[0-9a-f]{32}$/);
  } finally {
    Math.random = original;
  }
});

test("real keys are unique and long enough to be unguessable", () => {
  const keys = new Set(Array.from({ length: 200 }, () => generateIdempotencyKey({ getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })));
  assert.equal(keys.size, 200);
});
