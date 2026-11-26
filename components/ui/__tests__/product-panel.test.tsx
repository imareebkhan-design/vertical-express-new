import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import { ProductPanel } from "../product-panel";
import { CATEGORY_IMAGERY } from "@/lib/merchandising/home";

afterEach(cleanup);

/**
 * Category pictures are generated illustrations. Standing in for a product
 * with no photo of its own, one must never read as a photograph of that item.
 */

test("every category picture is declared an illustration, not a product photo", () => {
  const entries = Object.values(CATEGORY_IMAGERY);
  assert.ok(entries.length >= 20);
  for (const img of entries) assert.equal(img.kind, "category-illustration", img.src);
});

test("as a product stand-in it is labelled representative, visibly and to assistive tech", () => {
  render(<ProductPanel categorySlug="cement" label="OPC 53 Grade Cement, 50 kg Bag" />);
  const panel = screen.getByRole("img");
  assert.match(panel.getAttribute("aria-label") ?? "", /representative image, not a photo of this item/);
  assert.match(panel.textContent ?? "", /Representative image/);
  assert.equal(panel.getAttribute("data-illustration"), "category-illustration");
});

test("as a category tile it is just the category", () => {
  render(<ProductPanel use="category" categorySlug="cement" label="Cement" />);
  const panel = screen.getByRole("img");
  assert.equal(panel.getAttribute("aria-label"), "Cement");
  assert.doesNotMatch(panel.textContent ?? "", /Representative/);
});
