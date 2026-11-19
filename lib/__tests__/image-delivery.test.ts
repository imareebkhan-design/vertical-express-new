import test from "node:test";
import assert from "node:assert/strict";
import { deliveryUrlResolver, productionImageDeliveries, productImageDeliveryUrl } from "../catalog/image-delivery";

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

test("the shipped resolver maps nothing: retired-catalogue photos were deleted", () => {
  assert.equal(productionImageDeliveries.length, 0);
  withMode("production", "1", () => assert.equal(productImageDeliveryUrl({ id: fixture.id, url: fixture.from, sha256: fixture.sha256 }), fixture.from));
});
