import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { countdownLabel, resolveDealOfTheDay, type DealProduct } from "@/lib/merchandising/deal";
import {
  CATEGORY_IMAGERY,
  DEAL_OF_THE_DAY,
  HERO_BANNERS,
  LAUNCH_BANNER,
  TRENDING,
  categoryImage,
} from "@/lib/merchandising/home";

/**
 * The homepage merchandising layer exists to make the store look alive without
 * saying anything untrue. These pin the parts of that which code can enforce:
 * a deal shows only catalogue values, and the config carries no invented offer.
 */

const NOW = new Date("2026-10-07T10:00:00+05:30");
const product: DealProduct = {
  slug: "opc-53-cement",
  title: "OPC 53 Grade Cement",
  brandName: "UltraTech",
  imageUrl: null,
  unitLabel: "per bag",
  pricePaise: 38500,
  compareAtPaise: 44000,
  inStock: true,
};

test("no configured deal is 'coming soon', not an empty or made-up deal", () => {
  assert.deepEqual(resolveDealOfTheDay(null, product, NOW), { state: "coming-soon" });
});

test("a configured deal whose product is missing, unpublished or another product is 'coming soon'", () => {
  assert.equal(resolveDealOfTheDay({ productSlug: "opc-53-cement" }, null, NOW).state, "coming-soon");
  assert.equal(resolveDealOfTheDay({ productSlug: "something-else" }, product, NOW).state, "coming-soon");
});

test("an out-of-stock product is not offered as today's deal", () => {
  assert.equal(resolveDealOfTheDay({ productSlug: product.slug }, { ...product, inStock: false }, NOW).state, "coming-soon");
});

test("a live deal shows the catalogue's price and derives the discount, rounded down", () => {
  const v = resolveDealOfTheDay({ productSlug: product.slug }, product, NOW);
  assert.equal(v.state, "live");
  if (v.state !== "live") return;
  assert.equal(v.pricePaise, 38500);
  assert.equal(v.mrpPaise, 44000);
  // 12.5% off — never shown as 13%.
  assert.equal(v.discountPercent, 12);
  assert.equal(v.href, "/product/opc-53-cement");
  assert.equal(v.expiresAt, null);
});

test("no MRP, or an MRP not above the price, shows no strike-through and no percentage", () => {
  for (const compareAtPaise of [null, 38500, 30000]) {
    const v = resolveDealOfTheDay({ productSlug: product.slug }, { ...product, compareAtPaise }, NOW);
    assert.equal(v.state, "live");
    if (v.state !== "live") continue;
    assert.equal(v.mrpPaise, null, `compareAt ${compareAtPaise}`);
    assert.equal(v.discountPercent, null);
  }
});

test("a countdown exists only for a valid future expiry; a past or unreadable one hides the deal", () => {
  const future = resolveDealOfTheDay({ productSlug: product.slug, expiresAt: "2026-10-07T23:59:59+05:30" }, product, NOW);
  assert.equal(future.state, "live");
  if (future.state === "live") assert.ok(future.expiresAt instanceof Date);

  assert.equal(resolveDealOfTheDay({ productSlug: product.slug, expiresAt: "2026-10-07T09:00:00+05:30" }, product, NOW).state, "coming-soon");
  assert.equal(resolveDealOfTheDay({ productSlug: product.slug, expiresAt: "tomorrow" }, product, NOW).state, "coming-soon");
});

test("countdownLabel formats the remaining time and stops at zero", () => {
  assert.equal(countdownLabel(new Date(NOW.getTime() + (5 * 3600 + 42 * 60 + 9) * 1000), NOW), "05:42:09");
  assert.equal(countdownLabel(new Date(NOW.getTime() + 30 * 3600 * 1000), NOW), "30:00:00");
  assert.equal(countdownLabel(NOW, NOW), null);
});

test("the config carries no invented commercial claim", () => {
  // No deal and no launch-offer value until the owner supplies them.
  assert.equal(DEAL_OF_THE_DAY, null);
  assert.equal(LAUNCH_BANNER.offer, null);
  assert.equal(HERO_BANNERS[0].id, "launch");
  assert.equal(TRENDING.source, "curated");
  // The words a customer reads — not image paths or focal points.
  const copy = [
    ...HERO_BANNERS.flatMap((b) => [b.eyebrow, b.title, b.body, b.primary.label, b.secondary?.label ?? ""]),
    TRENDING.title,
    ...TRENDING.picks.flatMap((p) => [p.title, ...p.categories.map((c) => c.label)]),
  ].join("\n");
  assert.doesNotMatch(copy, /\d+\s*%|₹|rs\.?\s*\d|#1|best[- ]?sell|top[- ]?sell|minutes?\b/i);
});

test("every configured picture exists, and a category without one falls back", () => {
  const paths = [
    ...Object.values(CATEGORY_IMAGERY).map((i) => i.src),
    ...TRENDING.picks.map((p) => p.image.src),
    ...HERO_BANNERS.flatMap((b) => (b.visual.kind === "photo" ? [b.visual.image.src] : b.visual.images.map((i) => i.src))),
  ];
  for (const src of paths) assert.ok(existsSync(join(process.cwd(), "public", src)), `missing public${src}`);
  assert.equal(categoryImage("not-a-category"), null);
});
