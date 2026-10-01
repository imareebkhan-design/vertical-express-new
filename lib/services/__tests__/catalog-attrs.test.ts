import { test } from "node:test";
import assert from "node:assert/strict";

import { listProducts } from "../catalog";

/**
 * Attribute filters ("Shop by grade", Size, Finish) on a plain listing.
 *
 * The values live in a JSON column, so the filter runs in memory. It used to
 * run on the already-paged window with `total` counting the whole category:
 * a page could come back short or empty while the header promised more, and
 * page 2 could repeat nothing that matched. These tests hold the invariants
 * against whatever the seed holds, rather than against named products.
 */

async function everyItem(categorySlug: string) {
  const all = await listProducts({ categorySlug, perPage: 48 });
  assert.ok(all.total <= 48, "fixture category outgrew one page; widen the helper");
  return all;
}

async function aFilterable() {
  for (const slug of ["cement", "tiling", "painting"]) {
    const all = await everyItem(slug);
    const group = all.facets.attributes.find((g) => g.values.length > 0);
    if (group) return { slug, all, label: group.label, values: group.values };
  }
  return null;
}

test("attribute filter: total counts matches, not the whole category", async (t) => {
  const f = await aFilterable();
  if (!f) return t.skip("seed has no attribute data");
  const { slug, all, label, values } = f;
  const value = values[0]!.value;
  const expected = all.items.filter((i) => i.attributes[label] === value).length;

  const res = await listProducts({ categorySlug: slug, attrs: { [label]: value }, perPage: 48 });
  assert.equal(res.total, expected);
  assert.equal(res.items.length, expected);
  for (const i of res.items) assert.equal(i.attributes[label], value);
});

test("attribute filter: paging walks the matches, one page at a time", async (t) => {
  const f = await aFilterable();
  if (!f) return t.skip("seed has no attribute data");
  const { slug, all, label, values } = f;
  const value = values[0]!.value;
  const expected = all.items.filter((i) => i.attributes[label] === value).map((i) => i.id);

  const seen: string[] = [];
  for (let page = 1; page <= expected.length; page++) {
    const res = await listProducts({ categorySlug: slug, attrs: { [label]: value }, page, perPage: 1 });
    assert.equal(res.items.length, 1, `page ${page} of ${expected.length} came back empty`);
    assert.equal(res.items[0]!.attributes[label], value);
    seen.push(res.items[0]!.id);
  }
  assert.deepEqual([...seen].sort(), [...expected].sort(), "paging skipped or repeated a match");
});

test("attribute filter: the facet still offers the other values", async (t) => {
  const f = await aFilterable();
  if (!f) return t.skip("seed has no attribute data");
  const { slug, label, values } = f;
  const res = await listProducts({ categorySlug: slug, attrs: { [label]: values[0]!.value }, perPage: 1 });
  const group = res.facets.attributes.find((g) => g.label === label);
  assert.deepEqual(
    group?.values.map((v) => v.value).sort(),
    values.map((v) => v.value).sort(),
    "choosing one value hid the others, so the customer cannot switch"
  );
});

test("attribute facets count the whole category, not the page on screen", async (t) => {
  const f = await aFilterable();
  if (!f) return t.skip("seed has no attribute data");
  const { slug, label, values } = f;
  const onePage = await listProducts({ categorySlug: slug, perPage: 1 });
  const group = onePage.facets.attributes.find((g) => g.label === label);
  assert.deepEqual(
    group?.values,
    values,
    "a one-item page reported only that item's grade — the rail would undercount every other"
  );
});
