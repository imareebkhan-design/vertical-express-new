import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { cn } from "@/lib/utils";
import { PRODUCT_PHOTO } from "@/lib/product-media";

/**
 * Every web surface frames an exact product photo the same way
 * (lib/product-media.ts): contained, never cropped, no padding of its own.
 *
 * REGRESSION (9 Oct 2026): thirteen surfaces padded the photo differently
 * (p-1 … p-8), one cropped it with object-cover, and the PDPs sat it in a
 * tinted panel — so the same product was a different size on every surface
 * and a small object inside two frames on the product page.
 */

const ROOT = fileURLToPath(new URL("../../components/", import.meta.url));
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = join(dir, n);
    if (statSync(full).isDirectory()) return n === "__tests__" ? [] : files(full);
    return n.endsWith(".tsx") ? [full] : [];
  });
}

/* A product photo is an <img>/<Image>/<MotionImage> whose src is a product's
   image — not category art, banners, logos or brand marks. */
const PRODUCT_SRC = /src=\{\s*(?:item\.imageUrl|p\.imageUrl|line\.imageUrl|view\.imageUrl|img\.url|current\.url|product\.image\b|product\.images\[[^\]]+\]\??\.url)/;

function photoTags() {
  const out: { file: string; tag: string }[] = [];
  for (const f of files(ROOT)) {
    const src = readFileSync(f, "utf8");
    const re = /<(?:img|Image|MotionImage)\b[\s\S]*?\/>/g;
    for (const m of src.matchAll(re)) if (PRODUCT_SRC.test(m[0])) out.push({ file: relative(ROOT, f), tag: m[0] });
  }
  return out;
}

test("the scan finds the product-photo surfaces (a vacuous scan proves nothing)", () => {
  const surfaces = new Set(photoTags().map((t) => t.file));
  assert.ok(surfaces.size >= 12, `only ${surfaces.size} surfaces found: ${[...surfaces].join(", ")}`);
});

test("no product photo is cropped or padded; each uses the shared rule or plain object-contain", () => {
  for (const { file, tag } of photoTags()) {
    assert.doesNotMatch(tag, /object-cover/, `${file}: object-cover crops the product`);
    assert.doesNotMatch(tag, /\bp-(?:\d|\[)/, `${file}: padding on the photo shrinks the product per surface`);
    assert.match(tag, /PRODUCT_PHOTO\b|object-contain/, `${file}: product photo without contain`);
  }
});

test("the product pages frame photos square on white, not in a tinted panel", () => {
  const gallery = readFileSync(join(ROOT, "shop/product-gallery.tsx"), "utf8");
  assert.match(gallery, /aspect-square/);
  assert.match(gallery, /showsPhoto && PRODUCT_PHOTO_SURFACE/);
  assert.doesNotMatch(gallery, /h-\[360px\]/, "the old fixed-height wide panel");
  const phone = readFileSync(join(ROOT, "mobile/product/mobile-product-view.tsx"), "utf8");
  assert.match(phone, /product\.images\.length > 0 \? PRODUCT_PHOTO_SURFACE : "bg-tile"/);
  assert.doesNotMatch(phone, /snap-center p-6/, "the slide's own padding");
});

test("a fixed photo size is never overridden by the shared rule", () => {
  /* REGRESSION (11 Oct 2026): catalog-row wrote cn("size-[76px] sm:size-[92px]",
     PRODUCT_PHOTO). tailwind-merge keeps the LAST conflicting class, so
     PRODUCT_PHOTO's size-full removed size-[76px]: below 640px the photo had no
     size and drew at its natural 1000 x 1000, out of its frame and off the
     phone screen (the cement list). The fixed size must come after the rule. */
  assert.doesNotMatch(cn("size-[76px]", PRODUCT_PHOTO), /size-\[76px\]/, "the trap this guards against");
  assert.match(cn(PRODUCT_PHOTO, "size-[76px]"), /size-\[76px\]/);
  for (const { file, tag } of photoTags()) {
    const call = tag.match(/cn\(([\s\S]*?)\bPRODUCT_PHOTO\b/);
    if (!call) continue;
    assert.doesNotMatch(call[1], /(?:^|[\s"'])(?:[a-z]+:)?(?:size|w|h)-(?:\[|\d)/, `${file}: a fixed size before PRODUCT_PHOTO is discarded by cn()`);
  }
});

