import test from "node:test";
import assert from "node:assert/strict";
import { deliveryUrlResolver, productionImageDeliveries, type ImageDelivery } from "../catalog/image-delivery";
import retired from "./fixtures/retired-image-delivery-ids.json";

// The production list is empty since the retired catalogue's photos were deleted (19 Nov 2026);
// the resolution rules are exercised with a fixture in the same shape.
const fixture = {
  id: "00000000-0000-4000-8000-000000000001",
  sha256: "a".repeat(64),
  from: "https://storage.googleapis.com/ve-staging-product-images/products/fixture/fixture-official-1-display.webp",
  to: "https://storage.googleapis.com/ve-production-product-images/products/fixture/fixture-official-1-display.webp?generation=1",
};
const resolve = deliveryUrlResolver([fixture]);

function withMode(env: string, enabled: string, run: () => void) {
  const prior = [process.env.VE_DEPLOY_ENV, process.env.PRODUCTION_IMAGE_DELIVERY];
  try { process.env.VE_DEPLOY_ENV = env; process.env.PRODUCTION_IMAGE_DELIVERY = enabled; run(); }
  finally {
    for (const [i, key] of ["VE_DEPLOY_ENV", "PRODUCTION_IMAGE_DELIVERY"].entries()) {
      if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i];
    }
  }
}

test("manifest destinations pin exact generations in the production bucket", () => {
  assert.equal(new Set(productionImageDeliveries.map((i) => i.id)).size, productionImageDeliveries.length);
  for (const image of [...productionImageDeliveries, fixture]) {
    assert.match(image.sha256, /^[a-f0-9]{64}$/);
    const source = new URL(image.from), dest = new URL(image.to);
    assert.equal(source.origin, "https://storage.googleapis.com");
    assert.equal(dest.origin, source.origin);
    assert.equal(dest.username + dest.password + dest.hash, "");
    assert.match(source.pathname, /^\/ve-staging-product-images\//);
    assert.equal(dest.pathname, source.pathname.replace("/ve-staging-product-images/", "/ve-production-product-images/"));
    assert.deepEqual([...dest.searchParams.keys()], ["generation"]);
    assert.match(dest.searchParams.get("generation")!, /^\d+$/);
  }
});

test("production delivery changes no source record and rollback restores original URLs", () => {
  const entry = fixture;
  const row = Object.freeze({ id: entry.id, url: entry.from, sha256: entry.sha256 });
  withMode("production", "1", () => assert.equal(resolve(row), entry.to));
  withMode("production", "0", () => assert.equal(resolve(row), entry.from));
  assert.equal(row.url, entry.from);
});

test("staging and local never apply production delivery mappings", () => {
  const entry = fixture;
  for (const env of ["staging", "local", ""]) withMode(env, "1", () => {
    assert.equal(resolve({ id: entry.id, url: entry.from, sha256: entry.sha256 }), entry.from);
  });
});

test("wrong id, changed URL, missing or different hash never inherit a mapping", () => {
  const entry = fixture;
  const row = { id: entry.id, url: entry.from, sha256: entry.sha256 };
  withMode("production", "1", () => {
    for (const changed of [{ ...row, id: "other" }, { ...row, url: entry.from + "-new" }, { ...row, sha256: null }, { ...row, sha256: "0".repeat(64) }]) {
      assert.equal(resolve(changed), changed.url);
    }
    assert.equal(resolve(undefined), null);
  });
});

type Pin = { id: string; generation: string };
// Typed: an empty `recovered` list would otherwise be inferred as never[].
const recovered: readonly Pin[] = retired.recovered;

/** Why a manifest entry for a deleted retired-catalogue image is not allowed, if it is not.
 * Such an entry is allowed only when a reviewed recovery change lists the id in `recovered`
 * with the new generation of the restored object, and never pins the deleted generation. */
function retiredMappingProblems(entries: readonly ImageDelivery[], deleted: readonly Pin[], recovered: readonly Pin[]) {
  const deletedGeneration = new Map(deleted.map((p) => [p.id, p.generation]));
  const recoveredGeneration = new Map(recovered.map((p) => [p.id, p.generation]));
  const problems: string[] = [];
  for (const r of recovered) if (!deletedGeneration.has(r.id)) problems.push(`${r.id}: listed as recovered but was never deleted`);
  for (const entry of entries) {
    const old = deletedGeneration.get(entry.id);
    if (old === undefined) continue;
    const pinned = new URL(entry.to).searchParams.get("generation");
    if (pinned === old) problems.push(`${entry.id}: pins the deleted generation ${old}, which no longer serves`);
    else if (!recoveredGeneration.has(entry.id)) problems.push(`${entry.id}: retired image mapped without a recovery entry`);
    else if (recoveredGeneration.get(entry.id) !== pinned) problems.push(`${entry.id}: pins ${pinned}, recovery recorded ${recoveredGeneration.get(entry.id)}`);
  }
  return problems;
}

test("mappings for the deleted retired-catalogue images stay removed unless a reviewed recovery lists them", () => {
  assert.equal(new Set(retired.deleted.map((p) => p.id)).size, 260);
  for (const p of retired.deleted) assert.match(p.generation, /^\d+$/);
  for (const p of recovered) assert.match(p.generation, /^\d+$/);
  assert.deepEqual(retiredMappingProblems(productionImageDeliveries, retired.deleted, recovered), []);
});

test("the retired-image guard accepts only a recorded new generation for a restored photo", () => {
  // Synthetic recovery of one retired photo: same row id and hash, restored object, new generation.
  const object = "products/xp-agrikut-sumo/xp-agrikut-sumo-official-1-display.webp";
  const deleted: Pin[] = [{ id: "c35e7019-3f50-444c-88eb-a56fdb719490", generation: "1793813242834270" }];
  const mapping = (generation: string): ImageDelivery => ({
    id: deleted[0].id,
    sha256: "b".repeat(64),
    from: `https://storage.googleapis.com/ve-staging-product-images/${object}`,
    to: `https://storage.googleapis.com/ve-production-product-images/${object}?generation=${generation}`,
  });
  const restored = mapping("1800000000000001");

  assert.match(retiredMappingProblems([restored], deleted, [])[0], /without a recovery entry/);
  assert.match(retiredMappingProblems([mapping(deleted[0].generation)], deleted, [{ id: deleted[0].id, generation: deleted[0].generation }])[0], /deleted generation/);
  assert.match(retiredMappingProblems([restored], deleted, [{ id: deleted[0].id, generation: "1800000000000002" }])[0], /recovery recorded/);
  assert.match(retiredMappingProblems([], deleted, [{ id: "not-deleted", generation: "1" }])[0], /never deleted/);
  assert.deepEqual(retiredMappingProblems([restored], deleted, [{ id: deleted[0].id, generation: "1800000000000001" }]), []);

  const resolveRestored = deliveryUrlResolver([restored]);
  const row = { id: restored.id, url: restored.from, sha256: restored.sha256 };
  withMode("production", "1", () => assert.equal(resolveRestored(row), restored.to));
  withMode("production", "0", () => assert.equal(resolveRestored(row), restored.from));
});

test("a valid new mapping alongside the retired ids still resolves", () => {
  assert.ok(!retired.deleted.some((p) => p.id === fixture.id));
  const withNew = deliveryUrlResolver([...productionImageDeliveries, fixture]);
  assert.deepEqual(retiredMappingProblems([...productionImageDeliveries, fixture], retired.deleted, recovered), []);
  withMode("production", "1", () => assert.equal(withNew({ id: fixture.id, url: fixture.from, sha256: fixture.sha256 }), fixture.to));
});
