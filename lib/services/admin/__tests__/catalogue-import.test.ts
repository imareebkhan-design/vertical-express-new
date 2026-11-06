import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { CATALOGUE_HEADER, parseCatalogueCsv } from "@/lib/catalogue-csv";
import { importCatalogue, previewCatalogue } from "@/lib/services/admin/catalogue-import";

/**
 * Importing a catalogue file.
 *
 * The parser tests cover what a file can be wrong about on its own. These cover
 * what only the database knows: whether that brand exists, whether we deliver
 * to that pincode, and whether the product is already on the shelf.
 *
 * Two properties matter more than the rest.
 *
 * **All or none.** A catalogue is entered as one decision. Forty products in
 * and a failure on the forty-first leaves a shop half-stocked, with no record
 * of where the file stopped and no way to tell which half went in.
 *
 * **An existing product is never touched.** That is the owner's decision and
 * the safe one: an import that could update would let a stray row silently
 * reprice something already in a customer's cart, and whether a price change
 * may touch open carts is itself still open (ISS-068).
 */
const ACTOR = { id: "", email: "zzz-import@demo.invalid" };

let seq = 0;
const uniq = () => `ZZZ Import ${Date.now()}-${seq++}`;

/* The file's own user. The seed creates none; borrowing "whichever user
   exists" passed only because an earlier test file happened to leave one
   behind, and failed when this file ran alone on a fresh database. No phone or
   email, so nothing unique can collide. Deleted after the file's own cleanups. */
let OWN_USER: string | null = null;
async function ownUser(): Promise<string> {
  OWN_USER ??= (await db.user.create({ data: { id: randomUUID() }, select: { id: true } })).id;
  return OWN_USER;
}
after(async () => {
  if (OWN_USER) await db.user.deleteMany({ where: { id: OWN_USER } });
});

const H = CATALOGUE_HEADER.join(",");

interface Cell {
  [k: string]: string;
}

/** A valid row, so a test can spoil exactly one field. */
function row(base: Cell, over: Cell = {}): string {
  const all = { ...base, ...over };
  return CATALOGUE_HEADER.map((c) => all[c] ?? "").join(",");
}

const file = (...rows: string[]) => [H, ...rows].join("\n") + "\n";

/** Parse, then import. The two are always used together in production. */
async function runImport(csv: string) {
  const parsed = parseCatalogueCsv(csv);
  assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.issues));
  if (!parsed.ok) throw new Error("unreachable");
  return importCatalogue(parsed.rows, ACTOR);
}

async function runPreview(csv: string) {
  const parsed = parseCatalogueCsv(csv);
  assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.issues));
  if (!parsed.ok) throw new Error("unreachable");
  return previewCatalogue(parsed.rows);
}

/** The seeded world this file attaches to, rather than inventing one. */
async function world() {
  const [brand, category, warehouse, pincode, user] = await Promise.all([
    db.brand.findFirstOrThrow({ where: { isActive: true }, select: { name: true } }),
    db.category.findFirstOrThrow({ where: { isActive: true }, select: { slug: true } }),
    db.warehouse.findFirstOrThrow({ where: { isActive: true }, select: { name: true } }),
    db.serviceablePincode.findFirst({ where: { isActive: true }, select: { pincode: true } }),
    ownUser().then((id) => ({ id })),
  ]);
  assert.ok(pincode, "the seed has no serviceable pincode to import express products against");
  ACTOR.id = user?.id ?? "";
  return {
    base: {
      title: uniq(),
      brand: brand.name,
      category: category.slug,
      pack: "50 kg bag",
      unit_label: "per bag",
      price_rupees: "385",
      mrp_rupees: "",
      stock: "0",
      warehouse: "",
      express: "no",
      express_pincodes: "",
      /* Draft: a CSV row cannot carry an approved photo, so the commercial
         readiness gate refuses `published` (tested below). */
      status: "draft",
      description: "",
    } as Cell,
    warehouseName: warehouse.name,
    pincode: pincode.pincode.trim(),
  };
}

async function cleanup() {
  /* Audit rows are found through the scratch products that made them, not by
     entityType — deleting every "Product" audit row would take the real
     catalogue's trail with it. */
  const scratch = await db.product.findMany({
    where: { title: { startsWith: "ZZZ Import " } },
    select: { id: true },
  });
  const ids = scratch.map((p) => p.id);
  if (ids.length > 0) {
    const variants = await db.productVariant.findMany({
      where: { productId: { in: ids } },
      select: { id: true },
    });
    const vids = variants.map((v) => v.id);
    await db.stockMovement.deleteMany({ where: { variantId: { in: vids } } });
    await db.inventory.deleteMany({ where: { variantId: { in: vids } } });
    await db.auditLog.deleteMany({ where: { entityType: "Product", entityId: { in: ids } } });
  }
  await db.product.deleteMany({ where: { title: { startsWith: "ZZZ Import " } } });
}

test("a row becomes a product, its variant and its stock together", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await world();

  const res = await runImport(
    file(row(w.base, { stock: "120", warehouse: w.warehouseName, mrp_rupees: "440" }))
  );
  assert.equal(res.ok, true, res.ok ? "" : res.error);
  if (!res.ok) return;
  assert.equal(res.result.created, 1);

  const product = await db.product.findFirst({
    where: { title: w.base.title },
    include: { variants: { include: { inventory: true } } },
  });
  assert.ok(product, "the product was not written");
  assert.equal(product.status, "draft");

  const variant = product.variants[0];
  assert.ok(variant, "a product was created with no variant — nothing to add to a cart");
  assert.equal(variant.pricePaise, 38500, "the price is not the GST-inclusive rupees as paise");
  assert.equal(variant.compareAtPaise, 44000);
  assert.equal(variant.isDefault, true);

  assert.equal(variant.inventory.length, 1, "there is no stock row to adjust");
  assert.equal(variant.inventory[0].qtyOnHand, 120);

  const movement = await db.stockMovement.count({ where: { variantId: variant.id } });
  assert.equal(movement, 1, "opening stock arrived with nothing in the ledger to explain it");
});

test("stock of zero writes an inventory row but no movement", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await world();

  await runImport(file(row(w.base, { stock: "0", warehouse: "" })));

  const variant = await db.productVariant.findFirstOrThrow({
    where: { product: { title: w.base.title } },
    select: { id: true },
  });
  const movements = await db.stockMovement.count({ where: { variantId: variant.id } });
  /* "Received 0" is an event that never happened, and the ledger's whole
     promise is that every quantity can be explained. */
  assert.equal(movements, 0, "a received-nothing movement was invented");
});

test("an unknown brand fails the file, and writes none of it", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await world();
  const second = uniq();

  const preview = await runPreview(
    file(row(w.base), row(w.base, { title: second, brand: "No Such Brand At All" }))
  );

  assert.equal(preview.issues.length, 1, "the unknown brand was not reported");
  assert.equal(preview.issues[0].column, "brand");
  assert.match(preview.issues[0].message, /No Such Brand At All/);
  assert.equal(preview.toCreate.length, 1, "the good row should still be resolvable");

  /* And the import refuses the file rather than writing the half that resolved. */
  const parsed = parseCatalogueCsv(
    file(row(w.base), row(w.base, { title: second, brand: "No Such Brand At All" }))
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const res = await importCatalogue(parsed.rows, ACTOR);
  assert.equal(res.ok, false, "a file with an unknown brand was imported anyway");

  const written = await db.product.count({ where: { title: { startsWith: "ZZZ Import " } } });
  assert.equal(written, 0, "part of a refused file was written");
});

test("a brand the importer does not know is never created", async (t) => {
  /* Which real brand a product belongs to is a fact about what is in the
     warehouse. Creating one from a spreadsheet cell is how the fictional
     catalogue happened in the first place (ISS-007). */
  t.after(cleanup);
  await cleanup();
  const w = await world();

  const before = await db.brand.count();
  await runPreview(file(row(w.base, { brand: "Definitely Not A Real Brand" })));
  const after = await db.brand.count();
  assert.equal(after, before, "the importer invented a brand");
});

test("an express pincode we do not serve is refused", async (t) => {
  /* The schema has no foreign key here on purpose, so nothing but this check
     stops a product promising an hour to a pincode with no warehouse behind
     it. */
  t.after(cleanup);
  await cleanup();
  const w = await world();

  const unserved = await db.serviceablePincode.findFirst({ where: { pincode: "199999" } });
  assert.equal(unserved, null, "199999 is serviceable, so this test proves nothing");

  const preview = await runPreview(
    file(row(w.base, { express: "yes", express_pincodes: "199999" }))
  );
  assert.equal(preview.issues.length, 1, "an unserviceable express pincode was accepted");
  assert.equal(preview.issues[0].column, "express_pincodes");
  assert.equal(preview.toCreate.length, 0);
});

test("an express product records the pincodes it is eligible in", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await world();

  await runImport(file(row(w.base, { express: "yes", express_pincodes: w.pincode })));

  const product = await db.product.findFirstOrThrow({
    where: { title: w.base.title },
    include: { expressPincodes: true },
  });
  assert.equal(product.expressEligible, true);
  assert.deepEqual(
    product.expressPincodes.map((p) => p.pincode.trim()),
    [w.pincode],
    "the express promise was not recorded against a pincode"
  );
});

test("a product already on the shelf is skipped, and left exactly as it was", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await world();

  await runImport(file(row(w.base, { price_rupees: "385" })));
  const first = await db.productVariant.findFirstOrThrow({
    where: { product: { title: w.base.title } },
    select: { pricePaise: true, id: true },
  });
  assert.equal(first.pricePaise, 38500);

  /* Same product, different price. An import must not be a way to reprice. */
  const again = await runImport(file(row(w.base, { price_rupees: "999" })));
  assert.equal(again.ok, true, again.ok ? "" : again.error);
  if (!again.ok) return;
  assert.equal(again.result.created, 0, "an existing product was created a second time");
  assert.equal(again.result.skipped, 1, "the existing product was not reported as skipped");

  const after = await db.productVariant.findUniqueOrThrow({
    where: { id: first.id },
    select: { pricePaise: true },
  });
  assert.equal(
    after.pricePaise,
    38500,
    "an import silently repriced a product that was already listed"
  );

  const count = await db.product.count({ where: { title: w.base.title } });
  assert.equal(count, 1, "re-running the file duplicated the product");
});

test("the preview says which rows are already listed, before anything is written", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await world();
  const second = uniq();

  await runImport(file(row(w.base)));

  const preview = await runPreview(file(row(w.base), row(w.base, { title: second })));
  assert.equal(preview.toCreate.length, 1, "the new product is not offered");
  assert.equal(preview.toCreate[0].title, second);
  assert.equal(preview.skipped.length, 1, "the existing product is not reported");
  assert.equal(preview.skipped[0].reason, "product_exists");
  assert.equal(preview.skipped[0].line, 2, "the skipped row is not attributed to its line");
});

test("a preview writes nothing at all", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await world();

  await runPreview(file(row(w.base, { stock: "50", warehouse: w.warehouseName })));

  const written = await db.product.count({ where: { title: { startsWith: "ZZZ Import " } } });
  assert.equal(written, 0, "the dry run wrote a product");
});

test("every created product leaves an audit row, and a skipped one does not", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await world();
  const second = uniq();

  await runImport(file(row(w.base), row(w.base, { title: second })));

  const ids = (
    await db.product.findMany({
      where: { title: { startsWith: "ZZZ Import " } },
      select: { id: true },
    })
  ).map((p) => p.id);
  const audits = await db.auditLog.count({
    where: { entityType: "Product", entityId: { in: ids } },
  });
  assert.equal(audits, 2, "a product was listed with no audit row behind it");

  /* Re-running writes nothing, so it must also log nothing. */
  await runImport(file(row(w.base), row(w.base, { title: second })));
  const after = await db.auditLog.count({
    where: { entityType: "Product", entityId: { in: ids } },
  });
  assert.equal(after, 2, "skipping a product still wrote an audit row");
});

test("a failure part-way through takes the whole file with it", async (t) => {
  /* The property the transaction exists for.
   *
   * Staging it took a second attempt worth recording. The first version gave
   * the last row a SKU that already existed in the database — and that never
   * reached the transaction, because `previewCatalogue` looks exactly that up
   * and reports the row as already listed. A passing test that proved nothing
   * about rollback.
   *
   * So the collision has to be one the preview cannot see: two rows that both
   * look new, and collide with *each other* on the unique slug index at write
   * time. That is also the real race — two operators importing overlapping
   * files at the same moment — reduced to something a test can stage.
   *
   * Verified to fail when `db.$transaction` in importCatalogue is replaced by a
   * plain sequential loop: the first row commits and the count below is 1. */
  t.after(cleanup);
  await cleanup();
  const w = await world();
  const a = uniq();

  const parsed = parseCatalogueCsv(file(row(w.base, { title: a })));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const [only] = parsed.rows;
  const second = { ...only, line: 3, title: `${only.title} (again)` };
  const rows = [only, second];
  assert.equal(rows[0].slug, rows[1].slug, "the two rows must collide for this to test anything");

  const res = await importCatalogue(rows, ACTOR);
  assert.equal(res.ok, false, "a file whose rows collide with each other was imported");

  const written = await db.product.count({ where: { title: { startsWith: "ZZZ Import " } } });
  assert.equal(
    written,
    0,
    "the row before the failure was committed — the import is not all-or-nothing"
  );
});

test("a file where everything is already listed is a no-op, not an error", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await world();

  await runImport(file(row(w.base)));
  const res = await runImport(file(row(w.base)));

  assert.equal(res.ok, true, "re-uploading a finished file reported a failure");
  if (res.ok) {
    assert.equal(res.result.created, 0);
    assert.equal(res.result.skipped, 1);
  }
});

test("a formula in a looked-up column is refused by the lookup, and never stored", async (t) => {
  /* The parser guards title, pack, unit_label and description, because those
     are free text that reaches a row. brand, category and warehouse are not
     guarded there and do not need to be: they are resolved against real rows,
     so a value that is not one is refused before anything is written. This is
     what says so, rather than leaving it as an argument in a comment. */
  t.after(cleanup);
  await cleanup();
  const w = await world();

  for (const column of ["brand", "category", "warehouse"] as const) {
    const over: Cell = { [column]: '=cmd|"/c calc"!A1' };
    if (column === "warehouse") over.stock = "5";
    const preview = await runPreview(file(row(w.base, over)));
    assert.ok(preview.issues.length > 0, `a formula in ${column} resolved to something`);
    assert.equal(preview.toCreate.length, 0, `a formula in ${column} would have been written`);
  }

  const written = await db.product.count({ where: { title: { startsWith: "ZZZ Import " } } });
  assert.equal(written, 0, "a preview wrote a row");
});

test("a row imported straight into published is refused by the readiness gate, and nothing is written", async (t) => {
  t.after(cleanup);
  await cleanup();
  const w = await world();
  const res = await runImport(file(row(w.base, { status: "published", stock: "5", warehouse: w.warehouseName })));
  assert.equal(res.ok, false);
  assert.match(res.ok ? "" : res.error, /not sellable/);
  assert.equal(await db.product.count({ where: { title: w.base.title } }), 0, "the whole file rolled back");
});
