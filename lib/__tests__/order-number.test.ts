import test from "node:test";
import assert from "node:assert/strict";
import { generateOrderNumber } from "@/lib/order-number";

/**
 * ISS-108: the order-number suffix moved from Math.random to crypto.randomInt.
 * The format customers and support already see must not change.
 */

const FORMAT = /^VE-\d{4}-[0-9A-Z]+[0-9A-F]{4}$/;

test("keeps the VE-<year>-<base36 time><4 hex> format", () => {
  const now = new Date("2026-11-16T10:00:00Z");
  const n = generateOrderNumber(now, () => 0xbeef);
  assert.equal(n, `VE-2026-${now.getTime().toString(36).toUpperCase()}BEEF`);
  assert.match(n, FORMAT);
});

test("the suffix is zero-padded to four hex digits at both ends of the range", () => {
  const now = new Date("2026-11-16T10:00:00Z");
  assert.ok(generateOrderNumber(now, () => 0).endsWith("0000"));
  assert.ok(generateOrderNumber(now, () => 0xffff).endsWith("FFFF"));
});

test("asks the random source for the full 16-bit range", () => {
  let asked: [number, number] | null = null;
  generateOrderNumber(new Date(), (min, max) => {
    asked = [min, max];
    return 1;
  });
  assert.deepEqual(asked, [0, 0x10000]);
});

test("the default source is crypto.randomInt: real numbers match the format and vary", () => {
  const now = new Date("2026-11-16T10:00:00Z");
  const seen = new Set(Array.from({ length: 64 }, () => generateOrderNumber(now)));
  for (const n of seen) assert.match(n, FORMAT);
  assert.ok(seen.size > 1, "64 numbers from the same millisecond should not all collide");
});

test("the module no longer reaches for Math.random", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../order-number.ts", import.meta.url), "utf8");
  assert.equal(/Math\.random\s*\(/.test(source), false);
});
