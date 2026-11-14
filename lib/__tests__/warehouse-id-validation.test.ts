import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * The seeded main warehouse ("Srinagar Central") has the fixed id
 * 00000000-0000-0000-0000-000000000001. Zod 4's `uuid()` is strict RFC 9562 and
 * rejects it (no version nibble), so every stock adjustment and recount at the
 * main warehouse failed in the console with "Invalid UUID" — found on staging
 * on 5 Nov 2026 while verifying PR #36. Warehouse ids are validated with
 * `z.guid()`, which accepts any UUID-shaped id and still rejects junk.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SEEDED_WAREHOUSE = "00000000-0000-0000-0000-000000000001";

test("the seeded warehouse id is accepted, and junk is not", () => {
  assert.equal(z.string().uuid().safeParse(SEEDED_WAREHOUSE).success, false, "premise: strict uuid() rejects it");
  assert.equal(z.guid().safeParse(SEEDED_WAREHOUSE).success, true);
  assert.equal(z.guid().safeParse("not-an-id").success, false);
});

test("no server action validates a warehouse id with strict uuid()", () => {
  const dir = join(ROOT, "actions");
  let fields = 0;
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(dir, name), "utf8");
    for (const m of src.matchAll(/warehouseId\s*:\s*(z\.[^\n]*)/g)) {
      fields++;
      assert.doesNotMatch(m[1], /\buuid\(/, `actions/${name}: warehouseId uses strict uuid(): ${m[1]}`);
    }
  }
  assert.ok(fields >= 5, `only ${fields} warehouseId fields found`);
});
