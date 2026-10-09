import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * A catalog-only product makes no dispatch or returns promise, on either PDP.
 *
 * 48422a5 gated PdpPromises on the desktop PDP only; the mobile-web PDP kept
 * telling people a product they cannot buy is "Dispatched from our Srinagar
 * store". Found in the 9 Oct integration browser check.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

for (const file of ["components/mobile/product/mobile-product-view.tsx", "components/mobile/product/product-switcher.tsx"]) {
  test(`${file}: PdpPromises renders only for a purchasable product`, () => {
    const src = read(file);
    const at = src.indexOf("<PdpPromises");
    assert.ok(at > 0, "PdpPromises is rendered");
    const before = src.slice(Math.max(0, at - 400), at);
    assert.match(before, /product\.purchasable\s*&&/, "guarded by product.purchasable");
  });
}
