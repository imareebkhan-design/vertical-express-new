import test, { before } from "node:test";
import assert from "node:assert/strict";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BASE = "https://storage.googleapis.com/ve-production-product-images";
process.env.NEXT_PUBLIC_PRODUCT_IMAGE_PREVIOUS_BASE = "https://storage.googleapis.com/ve-staging-product-images";
let config: typeof import("@/next.config").default;
before(async () => { ({ default: config } = await import("@/next.config")); });

test("image cutover permits exactly the two named bucket paths", () => {
  const patterns = config(PHASE_PRODUCTION_BUILD).images?.remotePatterns;
  assert.deepEqual(patterns?.map((p) => new URL(p as URL).pathname).sort(), [
    "/ve-production-product-images/**", "/ve-staging-product-images/**",
  ]);
});
test("image cutover CSP permits the new and rollback buckets without allowing all GCS", async () => {
  const headers = await config(PHASE_PRODUCTION_BUILD).headers!();
  const policy = headers[0].headers.find((h) => h.key === "Content-Security-Policy")!.value;
  const images = policy.split(";").find((p) => p.trim().startsWith("img-src"))!;
  assert.match(images, /https:\/\/storage.googleapis.com\/ve-production-product-images\//);
  assert.match(images, /https:\/\/storage.googleapis.com\/ve-staging-product-images\//);
  assert.doesNotMatch(images, /https:\/\/storage.googleapis.com(?:\s|$)/);
});

test("enabled delivery permits generation queries only within the production bucket", () => {
  const env = process.env.VE_DEPLOY_ENV, enabled = process.env.PRODUCTION_IMAGE_DELIVERY;
  try {
    process.env.VE_DEPLOY_ENV = "production";
    process.env.PRODUCTION_IMAGE_DELIVERY = "1";
    const patterns = config(PHASE_PRODUCTION_BUILD).images!.remotePatterns!;
    const queryPattern = patterns.filter((p) => !(p instanceof URL));
    assert.deepEqual(queryPattern, [{ protocol: "https", hostname: "storage.googleapis.com", port: "", pathname: "/ve-production-product-images/**" }]);
    process.env.PRODUCTION_IMAGE_DELIVERY = "0";
    assert.equal(config(PHASE_PRODUCTION_BUILD).images!.remotePatterns!.length, 2);
  } finally {
    if (env === undefined) delete process.env.VE_DEPLOY_ENV; else process.env.VE_DEPLOY_ENV = env;
    if (enabled === undefined) delete process.env.PRODUCTION_IMAGE_DELIVERY; else process.env.PRODUCTION_IMAGE_DELIVERY = enabled;
  }
});
