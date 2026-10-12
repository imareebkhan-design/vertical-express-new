import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Icon-only buttons need an accessible name. A staging sweep (12 Oct 2026)
 * found six without one: product-card quick add and quantity stepper, voice and
 * barcode search, and the back buttons on checkout, wallet and addresses. A
 * screen reader announced each as "button". This pins them.
 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const cases: [string, RegExp][] = [
  ["components/mobile/home/mobile-product-card.tsx", /onClick=\{handleQuickAdd\}[\s\S]{0,200}?aria-label=/],
  ["components/mobile/home/mobile-product-card.tsx", /onClick=\{handleQuantityIncrease\}[\s\S]{0,120}?aria-label=/],
  ["components/mobile/home/mobile-product-card.tsx", /onClick=\{handleQuantityDecrease\}[\s\S]{0,120}?aria-label=/],
  ["components/mobile/search/mobile-search-view.tsx", /onClick=\{triggerVoiceSearch\}\s*aria-label="Search by voice"/],
  ["components/mobile/search/mobile-search-view.tsx", /onClick=\{triggerBarcodeScan\}\s*aria-label="Scan a barcode"/],
  ["components/mobile/checkout/mobile-checkout-view.tsx", /aria-label="Back"\s*className="flex size-9/],
  ["components/mobile/account/mobile-wallet-view.tsx", /aria-label="Back"\s*className="flex size-9/],
  ["components/mobile/account/mobile-addresses-view.tsx", /aria-label="Back"\s*className="flex size-9/],
];

for (const [file, pattern] of cases) {
  test(`${file}: ${pattern.source.slice(0, 40)}… has an accessible name`, () => {
    assert.match(src(file), pattern);
  });
}
