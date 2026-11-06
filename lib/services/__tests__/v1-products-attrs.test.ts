import { test } from "node:test";
import assert from "node:assert/strict";

import { handleListProducts } from "@/lib/api/v1";

/* The mobile "Shop by grade" path: the API honours a category's configured
   attributes by their lowercase name, and nothing else. */

async function list(qs: string) {
  const res = await handleListProducts(new Request(`http://localhost/api/v1/products?${qs}`));
  return (await res.json()).data as {
    total: number;
    items: { attributes: Record<string, string> }[];
    facets: { attributes: { label: string; values: { value: string; count: number }[] }[] };
  };
}

test("products API: ?grade= filters cement to that grade, and total agrees", async (t) => {
  const all = await list("category=cement&perPage=48");
  const grade = all.facets.attributes.find((g) => g.label === "Grade")?.values[0];
  if (!grade) return t.skip("seed has no cement grades");

  const res = await list(`category=cement&grade=${encodeURIComponent(grade.value)}&perPage=48`);
  assert.ok(res.items.length > 0);
  assert.equal(res.total, res.items.length);
  for (const i of res.items) assert.equal(i.attributes.Grade, grade.value);
});

test("products API: an attribute the category does not browse by is ignored", async () => {
  const all = await list("category=cement&perPage=48");
  const odd = await list("category=cement&colour=Red&perPage=48");
  assert.equal(odd.total, all.total, "an unconfigured attribute narrowed the listing");
});
