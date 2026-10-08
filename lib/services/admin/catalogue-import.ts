import "server-only";
import { db } from "@/lib/db";
import { NotSellableError, writeProduct, type NewProduct } from "@/lib/services/admin/product-create";
import type { CatalogueRow, CsvIssue } from "@/lib/catalogue-csv";

/**
 * Importing a catalogue file.
 *
 * `lib/catalogue-csv.ts` answers everything a file can answer on its own —
 * shapes, numbers, contradictions between columns. This answers the questions
 * that need the database: does that brand exist, is that pincode one we
 * actually deliver to, and is this product already on the shelf.
 *
 * TWO PHASES, AND WHY
 *
 * `previewCatalogue` resolves and checks everything and writes nothing.
 * `importCatalogue` does the same work again and then writes. The repetition is
 * deliberate — the preview's result is sent to a browser, and a browser is not
 * a source of truth. Trusting what came back would let a modified reply list a
 * product under a brand that does not exist, or at a price nobody typed.
 *
 * ALL OR NONE
 *
 * One transaction around every row, like `bulkSavePincodes`. A catalogue is
 * entered as one decision; forty products in and a failure on the forty-first
 * leaves a shop half-stocked with no record of where the file stopped. Foreign
 * keys are resolved *before* the transaction opens, so an unknown brand fails
 * the file rather than part of it.
 *
 * EXISTING PRODUCTS ARE SKIPPED, NEVER UPDATED
 *
 * The owner's decision, and the safe one. An import that could update would
 * mean a stray row silently reprices something already in a customer's cart —
 * and whether a price change may touch open carts is itself an open question
 * (ISS-068). Re-running a file is therefore harmless, which is what makes
 * "fix two rows and upload the whole thing again" a reasonable workflow.
 */

/** A row that will be written, with its foreign keys resolved. */
export interface ResolvedRow {
  line: number;
  title: string;
  slug: string;
  sku: string;
  brandName: string;
  categoryName: string;
  pricePaise: number;
  stock: number;
  express: boolean;
  expressPincodes: string[];
  status: "draft" | "published";
  /** Ready to hand to `writeProduct`. */
  input: NewProduct;
}

/** A row that is fine but is already on the shelf. */
export interface SkippedRow {
  line: number;
  title: string;
  slug: string;
  reason: "product_exists" | "sku_exists";
}

export interface ImportPreview {
  toCreate: ResolvedRow[];
  skipped: SkippedRow[];
  issues: CsvIssue[];
}

export interface ImportResult {
  created: number;
  skipped: number;
}

/**
 * Everything the file refers to, read once.
 *
 * Brands and categories are matched on name *or* slug because a person filling
 * a spreadsheet will write "Asian Paints" in one row and "asian-paints" in the
 * next, and both are unambiguous.
 */
async function resolveWorld() {
  const [brands, categories, warehouses, pincodes] = await Promise.all([
    db.brand.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true } }),
    db.category.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true } }),
    db.warehouse.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    db.serviceablePincode.findMany({ where: { isActive: true }, select: { pincode: true } }),
  ]);

  const key = (s: string) => s.trim().toLowerCase();
  const brandBy = new Map<string, string>();
  for (const b of brands) {
    brandBy.set(key(b.name), b.id);
    brandBy.set(key(b.slug), b.id);
  }
  const categoryBy = new Map<string, string>();
  for (const c of categories) {
    categoryBy.set(key(c.name), c.id);
    categoryBy.set(key(c.slug), c.id);
  }
  /* Warehouse names carry no unique constraint, so a duplicate name would make
     this map silently pick one. First wins, and the ops screen shows both. */
  const warehouseBy = new Map<string, string>();
  for (const w of warehouses) {
    if (!warehouseBy.has(key(w.name))) warehouseBy.set(key(w.name), w.id);
  }

  return {
    brandBy,
    categoryBy,
    warehouseBy,
    servicePincodes: new Set(pincodes.map((p) => p.pincode.trim())),
    brandNames: brands.map((b) => b.name),
    categorySlugs: categories.map((c) => c.slug),
    warehouseNames: warehouses.map((w) => w.name),
  };
}

/**
 * Resolve a parsed file against the catalogue. Writes nothing.
 *
 * Used by both the preview and the import, so the two can never disagree about
 * what a file means.
 */
export async function previewCatalogue(rows: CatalogueRow[]): Promise<ImportPreview> {
  const world = await resolveWorld();
  const key = (s: string) => s.trim().toLowerCase();

  const slugs = rows.map((r) => r.slug);
  const skus = rows.map((r) => r.sku);
  const [existingProducts, existingVariants] = await Promise.all([
    db.product.findMany({ where: { slug: { in: slugs } }, select: { slug: true } }),
    db.productVariant.findMany({ where: { sku: { in: skus } }, select: { sku: true } }),
  ]);
  const haveSlug = new Set(existingProducts.map((p) => p.slug));
  const haveSku = new Set(existingVariants.map((v) => v.sku));

  const toCreate: ResolvedRow[] = [];
  const skipped: SkippedRow[] = [];
  const issues: CsvIssue[] = [];

  for (const r of rows) {
    const before = issues.length;
    const bad = (column: CsvIssue["column"], message: string) =>
      issues.push({ line: r.line, column, message });

    const brandId = world.brandBy.get(key(r.brand));
    if (!brandId) {
      /* Never created. Which real brand a product belongs to is a fact about
         what is in the warehouse, and inventing one here is exactly the
         fictional-catalogue problem this import exists to end. */
      bad("brand", `There is no brand called "${r.brand}". Known: ${world.brandNames.join(", ")}`);
    }

    const categoryId = world.categoryBy.get(key(r.category));
    if (!categoryId) {
      bad(
        "category",
        `There is no category called "${r.category}". Valid: ${world.categorySlugs.join(", ")}`
      );
    }

    let warehouseId: string | undefined;
    if (r.stock > 0) {
      warehouseId = world.warehouseBy.get(key(r.warehouse));
      if (!warehouseId) {
        bad(
          "warehouse",
          `There is no warehouse called "${r.warehouse}". Known: ${world.warehouseNames.join(", ")}`
        );
      }
    }

    for (const pincode of r.expressPincodes) {
      if (!world.servicePincodes.has(pincode)) {
        /* The schema deliberately has no foreign key here, so nothing but this
           check stops a product promising an hour to a pincode we do not
           deliver to at all. */
        bad(
          "express_pincodes",
          `${pincode} is not a serviceable pincode, so "${r.title}" cannot be promised in 60 minutes there`
        );
      }
    }

    if (issues.length !== before) continue;

    if (haveSlug.has(r.slug)) {
      skipped.push({ line: r.line, title: r.title, slug: r.slug, reason: "product_exists" });
      continue;
    }
    if (haveSku.has(r.sku)) {
      /* A different product whose title happens to generate the same code.
         Reported rather than silently suffixed, because the two are probably
         the same thing typed twice. */
      skipped.push({ line: r.line, title: r.title, slug: r.slug, reason: "sku_exists" });
      continue;
    }

    toCreate.push({
      line: r.line,
      title: r.title,
      slug: r.slug,
      sku: r.sku,
      brandName: r.brand,
      categoryName: r.category,
      pricePaise: r.pricePaise,
      stock: r.stock,
      express: r.express,
      expressPincodes: r.expressPincodes,
      status: r.status,
      input: {
        title: r.title,
        slug: r.slug,
        brandId: brandId!,
        categoryId: categoryId!,
        description: r.description,
        unitLabel: r.unitLabel,
        /* Null means "inherit from the category", which is the honest default:
           per-product delivery speed is a decision made in the listing screen,
           not something a spreadsheet should assert by omission. */
        deliverySpeed: null,
        status: r.status,
        variant: {
          name: r.pack,
          sku: r.sku,
          pricePaise: r.pricePaise,
          compareAtPaise: r.compareAtPaise,
        },
        openingStock: warehouseId ? { warehouseId, qty: r.stock } : null,
        express: { eligible: r.express, pincodes: r.expressPincodes },
      },
    });
  }

  return { toCreate, skipped, issues };
}

/**
 * Write a whole file, or none of it.
 *
 * Re-resolves from scratch rather than trusting anything a preview produced,
 * and re-checks for existing products inside the transaction's own read, so two
 * operators importing overlapping files at the same moment cannot both create
 * the same product — the unique index on `slug` would abort one of them, and
 * aborting takes the whole transaction with it, which is the correct outcome.
 */
export async function importCatalogue(
  rows: CatalogueRow[],
  actor: { id: string; email: string }
): Promise<{ ok: true; result: ImportResult } | { ok: false; error: string }> {
  const preview = await previewCatalogue(rows);

  if (preview.issues.length > 0) {
    const first = preview.issues[0];
    return { ok: false, error: `Line ${first.line}: ${first.message}` };
  }
  if (preview.toCreate.length === 0) {
    return { ok: true, result: { created: 0, skipped: preview.skipped.length } };
  }

  try {
    await db.$transaction(async (tx) => {
      for (const row of preview.toCreate) {
        await writeProduct(tx, row.input, actor);
      }
    });
  } catch (err) {
    /* The row is not named here because the transaction is gone either way and
       a half-truth about which product failed is worse than none. The preview
       catches everything foreseeable; reaching here means a race or a constraint
       nobody modelled. */
    if (err instanceof NotSellableError) {
      return { ok: false, error: `${err.message}. Import it with status draft. Nothing was written.` };
    }
    const message = err instanceof Error ? err.message : "";
    if (message.includes("slug") || message.includes("sku")) {
      return {
        ok: false,
        error:
          "One of these products was created by somebody else while this file was being imported. " +
          "Nothing was written — upload it again.",
      };
    }
    return { ok: false, error: "That file could not be imported. Nothing was written." };
  }

  return {
    ok: true,
    result: { created: preview.toCreate.length, skipped: preview.skipped.length },
  };
}
