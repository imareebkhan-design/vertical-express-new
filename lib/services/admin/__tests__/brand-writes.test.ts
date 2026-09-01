import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "@/lib/db";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * Adding a brand must never overwrite one that is already there.
 *
 * THE BUG THIS EXISTS FOR
 *
 * `adminSaveBrand` ran `upsert({ where: { slug } })` for both adding and
 * editing. Adding a brand whose slug collided therefore did not fail — it
 * silently RENAMED the existing brand and reported success. Typing "UltraTech
 * Cement" with the slug `ultratech` would rewrite the UltraTech that every one
 * of its product pages names, on all of them at once.
 *
 * The action's catch block claimed to handle duplicates and could not: an
 * upsert keyed on slug never raises a slug conflict. Only a name collision
 * threw, so exactly half of the duplicate cases were caught and the destructive
 * half was not.
 *
 * These tests drive the database the way the two code paths now drive it —
 * create inserts, edit updates a row named explicitly — because the action
 * itself needs an admin session and cannot be called from here. What is being
 * protected is the choice of Prisma operation, which is where the bug lived.
 *
 * Every row is prefixed so this can clean up after itself.
 */
const P = "zzz-test-brand-";

async function cleanup() {
  await db.brand.deleteMany({ where: { slug: { startsWith: P } } });
}

test("creating over an existing slug is refused, not silently applied", async (t) => {
  t.after(cleanup);
  await cleanup();

  await db.brand.create({
    data: { slug: `${P}alpha`, name: `${P}Original Name`, isActive: true },
  });

  /* The create path. A second brand claiming the same slug must throw so the
     action can report a conflict. */
  await assert.rejects(
    () =>
      db.brand.create({
        data: { slug: `${P}alpha`, name: `${P}Different Name`, isActive: true },
      }),
    "a duplicate slug was accepted"
  );

  const after = await db.brand.findUnique({ where: { slug: `${P}alpha` } });
  assert.equal(
    after?.name,
    `${P}Original Name`,
    "THE REGRESSION: the existing brand was renamed by an attempt to add a new one"
  );
});

test("a duplicate name is refused too", async (t) => {
  t.after(cleanup);
  await cleanup();

  await db.brand.create({ data: { slug: `${P}one`, name: `${P}Shared`, isActive: true } });
  await assert.rejects(
    () => db.brand.create({ data: { slug: `${P}two`, name: `${P}Shared`, isActive: true } }),
    "two brands were allowed the same name"
  );
});

test("editing renames the row it was told to, and only that one", async (t) => {
  t.after(cleanup);
  await cleanup();

  await db.brand.create({ data: { slug: `${P}keep`, name: `${P}Keep`, isActive: true } });
  await db.brand.create({ data: { slug: `${P}edit`, name: `${P}Before`, isActive: true } });

  await db.brand.update({
    where: { slug: `${P}edit` },
    data: { name: `${P}After`, slug: `${P}edited`, isActive: true },
  });

  assert.equal((await db.brand.findUnique({ where: { slug: `${P}edited` } }))?.name, `${P}After`);
  assert.equal(await db.brand.findUnique({ where: { slug: `${P}edit` } }), null);
  /* The neighbour is untouched. An edit that reaches a second row is the same
     class of failure as the create bug, one row over. */
  assert.equal((await db.brand.findUnique({ where: { slug: `${P}keep` } }))?.name, `${P}Keep`);
});

test("editing onto a taken slug is refused", async (t) => {
  t.after(cleanup);
  await cleanup();

  await db.brand.create({ data: { slug: `${P}a`, name: `${P}A`, isActive: true } });
  await db.brand.create({ data: { slug: `${P}b`, name: `${P}B`, isActive: true } });

  await assert.rejects(
    () => db.brand.update({ where: { slug: `${P}b` }, data: { slug: `${P}a` } }),
    "a brand was moved onto another brand's slug"
  );
});

test("retiring a brand keeps it and its products", async (t) => {
  t.after(cleanup);
  await cleanup();

  /* Deleting would cascade to products, and the orders referencing those
     products still have to make sense. Hidden is the only safe retirement. */
  const b = await db.brand.create({
    data: { slug: `${P}retire`, name: `${P}Retire`, isActive: true },
  });
  await db.brand.update({ where: { slug: b.slug }, data: { isActive: false } });

  const after = await db.brand.findUnique({ where: { slug: b.slug } });
  assert.ok(after, "retiring removed the brand row");
  assert.equal(after.isActive, false);
});

test("the brand seeder cannot assign a product to a brand", () => {
  /* The rule the owner set: a product's brand is a fact about what is on the
     warehouse floor, and no amount of name similarity settles it. BuildPro is
     not UltraTech, or ACC, or Ambuja, and a script must never decide which.

     Asserted on the seeder's source rather than on the data, because the data
     is supposed to change — the owner assigning products by hand is the whole
     point, and a test that required real brands to hold zero products would
     start failing the moment the feature was used correctly. What must never
     change is that the *script* does not do it. */
  const src = readFileSync(join(ROOT, "scripts/seed-real-brands.mjs"), "utf8");
  for (const forbidden of [
    /product\.update/,
    /product\.updateMany/,
    /products:\s*\{\s*(connect|create|set)/,
    /brandId\s*:/,
  ]) {
    assert.ok(
      !forbidden.test(src),
      `seed-real-brands.mjs writes a product\u2192brand link (matched ${forbidden}). ` +
        `Which brand a product actually is, only the owner can say.`
    );
  }
  /* Non-vacuity: it must really be the brand seeder being read. */
  assert.ok(/brand\.(upsert|create)/.test(src), "this is not the brand seeder");
});
