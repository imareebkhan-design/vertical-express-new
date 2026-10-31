import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { matchesSha256, rehomePlan } from "@/lib/catalog/image-rehome";

/** E-6: production gets approved photos only, byte-identical to the hash recorded at import. */

const SRC = "https://storage.googleapis.com/ve-staging-product-images";
const DST = "https://storage.googleapis.com/ve-prod-product-images";
const sha = (c: string) => c.repeat(64);

test("an object's name is not trusted: any path in the source bucket is planned, the hash is what is checked", () => {
  const plan = rehomePlan([{ id: "o", url: `${SRC}/products/x/x-official-1-display.webp`, sha256: sha("9") }], { sourceBase: SRC, destBase: DST });
  assert.equal(plan.copy[0]?.to, `${DST}/products/x/x-official-1-display.webp`);
});

test("approved bucket photos are copied to the same path under the production bucket", () => {
  const plan = rehomePlan([{ id: "a", url: `${SRC}/cement-2026-10-11/${sha("a")}.png`, sha256: sha("a") }], { sourceBase: SRC, destBase: DST });
  assert.deepEqual(plan.copy, [{ id: "a", sha256: sha("a"), from: `${SRC}/cement-2026-10-11/${sha("a")}.png`, to: `${DST}/cement-2026-10-11/${sha("a")}.png` }]);
  assert.deepEqual([plan.local, plan.problems], [[], []]);
});

test("photos served by the app need no copy; one object backing two rows is copied once", () => {
  const url = `${SRC}/b/${sha("b")}.webp`;
  const plan = rehomePlan(
    [{ id: "q", url: "/qa/qa-test-item.svg", sha256: sha("c") }, { id: "b1", url, sha256: sha("b") }, { id: "b2", url, sha256: sha("b") }],
    { sourceBase: `${SRC}/`, destBase: DST }
  );
  assert.deepEqual(plan.local, [{ id: "q", url: "/qa/qa-test-item.svg" }]);
  assert.equal(plan.copy.length, 1);
});

test("anything that cannot be moved safely is a problem, never silently dropped", () => {
  const plan = rehomePlan(
    [
      { id: "elsewhere", url: "https://example.com/x.png", sha256: sha("d") },
      { id: "nosha", url: `${SRC}/x/${sha("e")}.png`, sha256: null },
    ],
    { sourceBase: SRC, destBase: DST }
  );
  assert.deepEqual(plan.problems.map((p) => [p.id, p.reason]), [
    ["elsewhere", "not in the source bucket"],
    ["nosha", "no recorded sha256"],
  ]);
  assert.equal(plan.copy.length, 0);
});

test("the same bucket for source and destination is refused", () => {
  assert.throws(() => rehomePlan([], { sourceBase: SRC, destBase: `${SRC}/` }));
});

test("an object matches only the hash of its exact bytes", () => {
  const bytes = new TextEncoder().encode("photo");
  assert.equal(matchesSha256(bytes, createHash("sha256").update(bytes).digest("hex")), true);
  assert.equal(matchesSha256(bytes, sha("0")), false);
});
