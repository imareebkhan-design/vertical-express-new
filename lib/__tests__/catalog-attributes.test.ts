import assert from "node:assert/strict";
import test from "node:test";

import {
  attributeConfigFor,
  attributeValue,
  attributesOf,
} from "@/lib/catalog-attributes";

/**
 * Browse-by-attribute is what lets someone choose a vitrified tile over a
 * ceramic one, or a matt finish over a gloss. Getting it wrong sends a buyer to
 * the wrong product, so the reading and configuration are covered here rather
 * than left to a visual check — the values live in a loosely typed JSON column
 * and the failure mode is silent.
 */

test("a category is browsed by the attribute its buyers actually choose on", () => {
  assert.equal(attributeConfigFor("cement").attributes[0], "Grade");
  assert.equal(attributeConfigFor("cement").railLabel, "Shop by grade");

  // Tile is chosen by type first — vitrified or ceramic — then size and finish.
  assert.deepEqual(attributeConfigFor("tiling").attributes, ["Type", "Size", "Finish", "Room"]);
  assert.equal(attributeConfigFor("tiling").railLabel, "Shop by type");
});

test("an unconfigured category still browses by type rather than breaking", () => {
  const cfg = attributeConfigFor("a-category-that-does-not-exist");
  assert.deepEqual(cfg.attributes, ["Type"]);
});

test("attribute lookup is case-insensitive on the label and trims the value", () => {
  const specs = [
    { label: "  type ", value: " Vitrified " },
    { label: "Finish", value: "Matt" },
  ];
  assert.equal(attributeValue(specs, "Type"), "Vitrified");
  assert.equal(attributeValue(specs, "FINISH"), "Matt");
  assert.equal(attributeValue(specs, "Room"), null);
});

test("a product with no specs yields no attributes rather than throwing", () => {
  // 42 of the 45 seeded products carry `specs: null` today, so this is the
  // common path, not an edge case.
  assert.deepEqual(attributesOf(null), {});
  assert.deepEqual(attributesOf(undefined), {});
  assert.deepEqual(attributesOf("not an array"), {});
  assert.equal(attributeValue(null, "Type"), null);
});

test("blank and malformed spec rows are dropped, not surfaced as empty filters", () => {
  const specs = [
    { label: "Type", value: "Ceramic" },
    { label: "Finish", value: "   " },
    { label: "Size" },
    { value: "orphaned" },
  ];
  assert.deepEqual(attributesOf(specs), { Type: "Ceramic" });
});

test("attributesOf keeps every labelled attribute, not only configured ones", () => {
  // The config decides what is *shown*; the reader stays faithful to the record
  // so an attribute added to the catalogue is not silently discarded here.
  const specs = [
    { label: "Type", value: "Vitrified" },
    { label: "Batch", value: "UTP-2608-A" },
  ];
  assert.deepEqual(attributesOf(specs), { Type: "Vitrified", Batch: "UTP-2608-A" });
});
