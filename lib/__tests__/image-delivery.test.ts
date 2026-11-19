import test from "node:test";
import assert from "node:assert/strict";
import {
  createImageDeliveryResolver,
  productionImageDeliveries,
  productImageDeliveryUrl,
  type ImageDelivery,
} from "../catalog/image-delivery";

function withMode(env: string, enabled: string, run: () => void) {
  const prior = [process.env.VE_DEPLOY_ENV, process.env.PRODUCTION_IMAGE_DELIVERY];
  try { process.env.VE_DEPLOY_ENV = env; process.env.PRODUCTION_IMAGE_DELIVERY = enabled; run(); }
  finally {
    for (const [i, key] of ["VE_DEPLOY_ENV", "PRODUCTION_IMAGE_DELIVERY"].entries()) {
      if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i];
    }
  }
}

// A sample entry, so the resolver's rules stay tested while the real manifest is empty.
const entry: ImageDelivery = {
  id: "00000000-0000-4000-8000-000000000001",
  sha256: "a".repeat(64),
  from: "https://storage.googleapis.com/ve-staging-product-images/products/sample/sample-official-1-display.webp",
  to: "https://storage.googleapis.com/ve-production-product-images/products/sample/sample-official-1-display.webp?generation=1",
};
const resolve = createImageDeliveryResolver([entry]);

test("manifest destinations, if any, pin exact generations in the production bucket", () => {
  assert.equal(new Set(productionImageDeliveries.map((i) => i.id)).size, productionImageDeliveries.length);
  for (const image of [...productionImageDeliveries, entry]) {
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

test("the shipped manifest maps no images: the legacy photos it pointed at were deleted", () => {
  assert.equal(productionImageDeliveries.length, 0);
  withMode("production", "1", () => {
    assert.equal(productImageDeliveryUrl({ id: entry.id, url: entry.from, sha256: entry.sha256 }), entry.from);
  });
});

test("production delivery changes no source record and rollback restores original URLs", () => {
  const row = Object.freeze({ id: entry.id, url: entry.from, sha256: entry.sha256 });
  withMode("production", "1", () => assert.equal(resolve(row), entry.to));
  withMode("production", "0", () => assert.equal(resolve(row), entry.from));
  assert.equal(row.url, entry.from);
});

test("staging and local never apply production delivery mappings", () => {
  for (const env of ["staging", "local", ""]) withMode(env, "1", () => {
    assert.equal(resolve({ id: entry.id, url: entry.from, sha256: entry.sha256 }), entry.from);
  });
});

test("wrong id, changed URL, missing or different hash never inherit a mapping", () => {
  const row = { id: entry.id, url: entry.from, sha256: entry.sha256 };
  withMode("production", "1", () => {
    for (const changed of [{ ...row, id: "other" }, { ...row, url: entry.from + "-new" }, { ...row, sha256: null }, { ...row, sha256: "0".repeat(64) }]) {
      assert.equal(resolve(changed), changed.url);
    }
    assert.equal(resolve(undefined), null);
  });
});
