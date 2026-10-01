import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { brandsForSearchEntry, closestInStock, listProducts } from "@/lib/services/catalog";
import { db } from "@/lib/db";

/**
 * The two states a search screen spends most of its time in: before anything is
 * typed, and after something is typed that we do not sell.
 *
 * Both used to be filled with invented content — five hardcoded terms under the
 * heading "Popular Searches", and a dead end that offered nothing. The risk in
 * replacing them is doing it with a different invention, so what is tested here
 * is mostly restraint: that a brand shortcut leads somewhere real, and that
 * "closest things we stock" means closest and not merely popular.
 */

test("only brands with something published behind them are offered", async () => {
  const offered = await brandsForSearchEntry();
  assert.ok(offered.length > 0, "no brands offered at all — this guard would be vacuous");

  for (const b of offered) {
    assert.ok(b.count > 0, `"${b.name}" is offered as a shortcut with nothing behind it`);
    const real = await db.product.count({
      where: { brand: { slug: b.slug }, status: "published" },
    });
    assert.equal(real, b.count, `the count shown for "${b.name}" is not what it leads to`);
  }
});

test("a brand with no products is never offered", async (t) => {
  /* THE CASE THAT MATTERS. The eleven real brands were seeded deliberately
     holding zero products, because which product is actually an UltraTech is
     the owner's to say. Offering them as shortcuts would send a customer to an
     empty results page having just been told we stock the brand.

     The test brings its own empty brand rather than relying on those: CI seeds
     only prisma/seed.ts, where every brand has products, so without this the
     guard below had nothing to prove. Active, so the only reason for it to be
     left out is that nothing is published under it. */
  const own = await db.brand.create({
    data: { slug: `zzz-empty-${randomUUID()}`, name: `ZZZ Empty ${randomUUID()}`, isActive: true },
    select: { slug: true, name: true },
  });
  t.after(() => db.brand.delete({ where: { slug: own.slug } }));

  const empty = await db.brand.findMany({
    where: { products: { none: { status: "published" } } },
    select: { slug: true, name: true },
  });
  assert.ok(
    empty.some((b) => b.slug === own.slug),
    "the scratch brand with nothing published does not read as empty"
  );

  const offered = new Set((await brandsForSearchEntry()).map((b) => b.slug));
  for (const b of empty) {
    assert.ok(!offered.has(b.slug), `"${b.name}" has no products but is offered as a shortcut`);
  }
});

test("an inactive brand is never offered", async (t) => {
  const target = (await brandsForSearchEntry())[0];
  assert.ok(target, "nothing to hide");

  await db.brand.update({ where: { slug: target.slug }, data: { isActive: false } });
  t.after(() => db.brand.update({ where: { slug: target.slug }, data: { isActive: true } }));

  const offered = new Set((await brandsForSearchEntry()).map((b) => b.slug));
  assert.ok(!offered.has(target.slug), "a retired brand is still offered on the search screen");
});

test("brands are ordered by how much there is to buy", async () => {
  const offered = await brandsForSearchEntry();
  for (let i = 1; i < offered.length; i++) {
    assert.ok(
      offered[i - 1].count >= offered[i].count,
      `${offered[i].name} (${offered[i].count}) is listed above a larger brand`
    );
  }
});

test("closest matches on a single word of a multi-word miss", async () => {
  /* "waterproof cement paint" finds nothing as a phrase. "cement" and "paint"
     are real shelves, and results from them genuinely answer what was asked. */
  const { items, matchedOn } = await closestInStock("waterproof cement paint");
  assert.ok(items.length > 0, "a query containing a real category word found nothing close");
  assert.ok(matchedOn.length > 0, "results were returned without saying what matched");
  for (const w of matchedOn) {
    assert.ok(
      "waterproof cement paint".includes(w),
      `matched on "${w}", which is not a word the customer typed`
    );
  }
});

test("closest returns nothing when nothing is close", async () => {
  /* THE RULE THIS FILE EXISTS FOR. It would be easy — and it is what most
     shops do — to fall back to best-sellers here. Showing an unrelated product
     to somebody who searched for an excavator, under a heading that says
     "closest things we do stock", is a small lie told to a person standing on a
     site who needs an answer. Empty is the honest result. */
  const { items, matchedOn } = await closestInStock("zzzqqq excavator lease helicopter");
  assert.deepEqual(matchedOn, [], "claimed to match a word that matches nothing");
  assert.equal(items.length, 0, "unrelated products were offered as the closest thing we stock");
});

test("closest ignores words too short to mean anything", async () => {
  /* "of", "mm", "20" match most of a catalogue. Letting them through turns a
     miss into a random assortment, which is the same failure wearing a
     plausible mask. */
  const { items, matchedOn } = await closestInStock("20 mm of zzzqqq");
  assert.deepEqual(matchedOn, [], `matched on ${JSON.stringify(matchedOn)}`);
  assert.equal(items.length, 0);
});

test("closest never repeats a product across matched words", async () => {
  const { items } = await closestInStock("cement paint tiles");
  const ids = items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, "the same product is offered twice");
});

test("an empty query asks for nothing", async () => {
  assert.deepEqual(await closestInStock(""), { items: [], matchedOn: [] });
  assert.deepEqual(await closestInStock("   "), { items: [], matchedOn: [] });
});

test("the closest grid is reachable at all", async () => {
  /* THE GAP THE REST OF THIS FILE MISSED.

     Every other test calls closestInStock directly. The screen does not — it
     only asks for a fallback when the main search has already returned
     nothing. And the main search is not a naive `contains`: it tokenises and
     expands synonyms, so most queries with one real word in them already
     return results and never reach the fallback.

     That leaves a way for this feature to be perfectly correct and completely
     dead. Probing eleven realistic misses found exactly one that reaches it —
     "helicopter wire", where the main search finds nothing and "wire" on its
     own finds three. Narrow, but real, and asserted here so that a future
     change to the main search cannot quietly turn the section into code that
     never runs without a test going red.

     Verified in the browser at 375px: the screen shows "Nothing matches
     'helicopter wire'" above "Closest things we do stock — matched on 'wire'"
     and three copper wire products. */
  const q = "helicopter wire";
  const main = await listProducts({ search: q, perPage: 6 });
  assert.equal(
    main.items.length,
    0,
    "the main search now handles this query, so the fallback never renders for it — " +
      "find another query that misses, or the closest grid is dead code"
  );

  const close = await closestInStock(q);
  assert.ok(close.items.length > 0, "the fallback has nothing for a query the main search missed");
  assert.deepEqual(close.matchedOn, ["wire"]);
});
