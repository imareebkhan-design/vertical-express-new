import test from "node:test";
import assert from "node:assert/strict";
import { brandSlug, categorySlug } from "@/lib/services/admin/taxonomy-slug";

test("brand and category names become single-hyphen lowercase slugs", () => {
  assert.equal(brandSlug("UltraTech Cement"), "ultratech-cement");
  assert.equal(brandSlug("  Dr. Fixit  "), "dr-fixit");
  assert.equal(categorySlug("CCTV & Security"), "cctv-and-security");
  assert.equal(categorySlug("Wood  Flooring--"), "wood-flooring");
  assert.equal(brandSlug("Café"), "cafe");
  assert.equal(brandSlug("!!!"), "");
  assert.match(categorySlug("x".repeat(80)), /^x{60}$/);
});
