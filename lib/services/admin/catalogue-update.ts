import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { recordAudit, type DbClient } from "@/lib/services/audit";
import { MAX_STORED_PAISE } from "@/lib/services/admin/variant-pricing";
import {
  csvCell,
  rupees,
  STOCK_COUNT_HEADER,
  VARIANT_UPDATE_HEADER,
  type StockCountRow,
  type UpdateIssue,
  type VariantUpdateRow,
} from "@/lib/catalogue-update-csv";

/**
 * Enriching the existing catalogue from a file: variants, MRPs and prices on
 * one sheet, shelf counts on another (`lib/catalogue-update-csv.ts`).
 *
 * PREVIEW, THEN APPLY THE SAME PLAN
 *
 * `planVariantUpdates` / `planStockCounts` read and classify every row —
 * create, update, unchanged, invalid, conflict — and write nothing. The plan
 * has a digest. Apply re-reads the file and the shop inside one transaction,
 * plans again, and writes only if the digest is the one the operator
 * previewed. A catalogue that changed in between (someone repriced a variant,
 * an order reserved stock) gives a different plan, and nothing is written:
 * preview again and look.
 *
 * ALL OR NONE
 *
 * A file with any invalid or conflicting row applies nothing. Every write is
 * compare-and-set against the value just read, so a concurrent change that
 * lands mid-batch rolls the whole batch back rather than half of it.
 *
 * WHAT IS NEVER TOUCHED
 *
 * Product slugs, titles, photos, approvals, specs, status, orders, carts,
 * reservations. A price or variant change revokes the owner's commercial
 * review in the database (trigger `invalidate_variant_commercial_review`), so a
 * changed offer leaves the shop until it is approved again — this file cannot
 * publish anything. Stock counts set on-hand to what was counted (a repeat
 * upload of the same count is "unchanged"), never add to it, and never move
 * `qty_reserved`.
 */

export type RowAction = "create" | "update" | "unchanged" | "invalid" | "conflict";

export interface FieldChange {
  field: "name" | "mrpPaise" | "pricePaise" | "isDefault" | "qtyOnHand";
  from: string | number | boolean | null;
  to: string | number | boolean | null;
}

export interface PlannedRow {
  line: number;
  action: RowAction;
  /** product slug (variants) or warehouse name (stock) — for the screen. */
  scope: string;
  sku: string;
  changes: FieldChange[];
  message?: string;
}

export interface UpdatePlan {
  rows: PlannedRow[];
  counts: Record<RowAction, number>;
  /** Over every row's action and change. Apply refuses a different one. */
  digest: string;
  /** True only with no invalid or conflicting row and at least one write. */
  applicable: boolean;
}

export type ApplyResult =
  | { ok: true; batchId: string; created: number; updated: number; unchanged: number }
  | { ok: false; reason: "not_applicable"; plan: UpdatePlan }
  | { ok: false; reason: "plan_changed"; plan: UpdatePlan }
  | { ok: false; reason: "stale" };

class StaleWrite extends Error {}

function finish(rows: PlannedRow[], parseIssues: UpdateIssue[]): UpdatePlan {
  const all = [
    ...rows,
    ...parseIssues.map((i) => ({ line: i.line, action: "invalid" as const, scope: i.column ?? "", sku: "", changes: [], message: i.message })),
  ].sort((a, b) => a.line - b.line);
  const counts: Record<RowAction, number> = { create: 0, update: 0, unchanged: 0, invalid: 0, conflict: 0 };
  for (const r of all) counts[r.action]++;
  const digest = createHash("sha256")
    .update(JSON.stringify(all.map((r) => [r.line, r.action, r.scope, r.sku, r.changes])))
    .digest("hex");
  return { rows: all, counts, digest, applicable: counts.invalid === 0 && counts.conflict === 0 && counts.create + counts.update > 0 };
}

/* ------------------------------------------------------------------ */
/* Variants, MRP and price                                             */
/* ------------------------------------------------------------------ */

async function readVariantWorld(client: DbClient, rows: VariantUpdateRow[]) {
  const slugs = [...new Set(rows.map((r) => r.productSlug))];
  const skus = [...new Set(rows.map((r) => r.sku))];
  const [products, bySku] = await Promise.all([
    client.product.findMany({
      where: { slug: { in: slugs } },
      select: {
        id: true, slug: true, status: true,
        variants: { select: { id: true, sku: true, name: true, pricePaise: true, compareAtPaise: true, isDefault: true, isActive: true } },
      },
    }),
    client.productVariant.findMany({
      where: { sku: { in: skus, mode: "insensitive" } },
      select: { id: true, sku: true, productId: true, product: { select: { slug: true } } },
    }),
  ]);
  return { products: new Map(products.map((p) => [p.slug, p])), bySku: new Map(bySku.map((v) => [v.sku.toLowerCase(), v])) };
}

export async function planVariantUpdates(
  client: DbClient,
  parsed: { rows: VariantUpdateRow[]; issues: UpdateIssue[] }
): Promise<UpdatePlan> {
  const world = await readVariantWorld(client, parsed.rows);
  const out: PlannedRow[] = [];
  /* Which new variant leads a product that has no active default: the one the
     file marks, else the first new one in file order. Decided once per product
     so two new rows cannot both become the default. */
  const defaultTaken = new Set(parsed.rows.filter((r) => r.makeDefault).map((r) => r.productSlug));

  for (const r of parsed.rows) {
    const base = { line: r.line, scope: r.productSlug, sku: r.sku, changes: [] as FieldChange[] };
    const refuse = (action: "invalid" | "conflict", message: string) => out.push({ ...base, action, message });
    const product = world.products.get(r.productSlug);
    if (!product) {
      refuse("invalid", `No product has the slug "${r.productSlug}". This file only updates products already in the catalogue`);
      continue;
    }
    if (product.status === "archived") {
      refuse("conflict", "That product is archived; restore it in the console before changing its variants");
      continue;
    }
    if (r.mrpPaise > MAX_STORED_PAISE || r.pricePaise > MAX_STORED_PAISE) {
      refuse("invalid", "That amount is too large to store");
      continue;
    }
    const owner = world.bySku.get(r.sku.toLowerCase());
    if (owner && owner.productId !== product.id) {
      refuse("conflict", `SKU "${r.sku}" belongs to another product ("${owner.product.slug}"). A SKU is never moved by a file`);
      continue;
    }
    const existing = product.variants.find((v) => v.sku.toLowerCase() === r.sku.toLowerCase());

    if (!existing) {
      if (!r.claimsNew) {
        refuse("conflict", `SKU "${r.sku}" is not on this product, but the row gives current values for it. Export again, or leave both current_ cells blank to add it`);
        continue;
      }
      if (!r.mrpEvidence) {
        refuse("invalid", "A new variant's MRP needs its evidence in mrp_evidence (price list, pack photo, or source and date)");
        continue;
      }
      const leads = r.makeDefault || (!defaultTaken.has(r.productSlug) && !product.variants.some((v) => v.isActive && v.isDefault));
      if (leads) defaultTaken.add(r.productSlug);
      out.push({
        ...base,
        action: "create",
        changes: [
          { field: "name", from: null, to: r.variantName },
          { field: "mrpPaise", from: null, to: r.mrpPaise },
          { field: "pricePaise", from: null, to: r.pricePaise },
          ...(leads ? [{ field: "isDefault" as const, from: null, to: true }] : []),
        ],
      });
      continue;
    }

    if (r.claimsNew) {
      refuse("conflict", `SKU "${r.sku}" already exists on this product. Export the current catalogue and edit that row instead`);
      continue;
    }
    if (r.currentPricePaise !== existing.pricePaise || r.currentMrpPaise !== existing.compareAtPaise) {
      refuse(
        "conflict",
        `Changed since your export: the shop now has price ₹${rupees(existing.pricePaise)}, MRP ${existing.compareAtPaise === null ? "blank" : `₹${rupees(existing.compareAtPaise)}`}. Export again`
      );
      continue;
    }
    if (r.makeDefault && !existing.isActive) {
      refuse("invalid", "An inactive variant cannot be the default; reactivate it in the console first");
      continue;
    }
    const changes: FieldChange[] = [];
    if (r.variantName && r.variantName !== existing.name) changes.push({ field: "name", from: existing.name, to: r.variantName });
    if (r.mrpPaise !== existing.compareAtPaise) changes.push({ field: "mrpPaise", from: existing.compareAtPaise, to: r.mrpPaise });
    if (r.pricePaise !== existing.pricePaise) changes.push({ field: "pricePaise", from: existing.pricePaise, to: r.pricePaise });
    if (r.makeDefault && !existing.isDefault) changes.push({ field: "isDefault", from: false, to: true });
    if (changes.some((c) => c.field === "mrpPaise") && !r.mrpEvidence) {
      refuse("invalid", "The MRP changes, so mrp_evidence must say where it comes from");
      continue;
    }
    out.push({ ...base, action: changes.length ? "update" : "unchanged", changes });
  }
  return finish(out, parsed.issues);
}

export async function applyVariantUpdates(
  parsed: { rows: VariantUpdateRow[]; issues: UpdateIssue[] },
  previewedDigest: string,
  actor: { id: string; email: string },
  file: { sha256: string }
): Promise<ApplyResult> {
  try {
    return await db.$transaction(async (tx) => {
      /* Lock the products first, so the plan below and the writes after it see
         the same variants (an operator adding a variant mid-batch waits). */
      const slugs = [...new Set(parsed.rows.map((r) => r.productSlug))];
      if (slugs.length) await tx.$queryRaw`SELECT id FROM products WHERE slug = ANY(${slugs}::text[]) FOR UPDATE`;
      const plan = await planVariantUpdates(tx, parsed);
      if (!plan.applicable) return { ok: false, reason: "not_applicable", plan } as const;
      if (plan.digest !== previewedDigest) return { ok: false, reason: "plan_changed", plan } as const;

      const world = await readVariantWorld(tx, parsed.rows);
      const batchId = randomUUID();
      const byLine = new Map(parsed.rows.map((r) => [r.line, r]));
      for (const p of plan.rows) {
        if (p.action !== "create" && p.action !== "update") continue;
        const r = byLine.get(p.line)!;
        const product = world.products.get(r.productSlug)!;
        const becomesDefault = p.changes.some((c) => c.field === "isDefault" && c.to === true);
        if (becomesDefault) {
          await tx.productVariant.updateMany({ where: { productId: product.id, isDefault: true }, data: { isDefault: false } });
        }
        if (p.action === "create") {
          const v = await tx.productVariant.create({
            data: {
              productId: product.id, sku: r.sku, name: r.variantName!, pricePaise: r.pricePaise,
              compareAtPaise: r.mrpPaise, isActive: true, isDefault: becomesDefault,
            },
            select: { id: true },
          });
          await recordAudit(tx, {
            actorType: "admin", actorId: actor.id, action: "catalogue.variant_added", entityType: "product", entityId: product.id,
            after: { batchId, variantId: v.id, sku: r.sku, name: r.variantName, pricePaise: r.pricePaise, compareAtPaise: r.mrpPaise, isDefault: becomesDefault, mrpEvidence: r.mrpEvidence, by: actor.email },
          });
        } else {
          const v = product.variants.find((x) => x.sku.toLowerCase() === r.sku.toLowerCase())!;
          const written = await tx.productVariant.updateMany({
            where: { id: v.id, pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise, name: v.name },
            data: {
              name: r.variantName ?? v.name, pricePaise: r.pricePaise, compareAtPaise: r.mrpPaise,
              ...(becomesDefault ? { isDefault: true } : {}),
            },
          });
          if (written.count !== 1) throw new StaleWrite();
          await recordAudit(tx, {
            actorType: "admin", actorId: actor.id, action: "variant.updated_from_file", entityType: "product_variant", entityId: v.id,
            before: { name: v.name, pricePaise: v.pricePaise, compareAtPaise: v.compareAtPaise, isDefault: v.isDefault },
            after: {
              batchId, name: r.variantName ?? v.name, pricePaise: r.pricePaise, compareAtPaise: r.mrpPaise,
              isDefault: becomesDefault || v.isDefault, mrpEvidence: r.mrpEvidence || null, by: actor.email,
            },
          });
        }
      }
      await recordAudit(tx, {
        actorType: "admin", actorId: actor.id, action: "catalogue.update_file_applied", entityType: "catalogue_update", entityId: batchId,
        after: { kind: "variants", fileSha256: file.sha256, digest: plan.digest, counts: plan.counts, by: actor.email },
      });
      return { ok: true, batchId, created: plan.counts.create, updated: plan.counts.update, unchanged: plan.counts.unchanged } as const;
    });
  } catch (e) {
    if (e instanceof StaleWrite) return { ok: false, reason: "stale" };
    throw e;
  }
}

/** Every variant of the given products (or all non-archived ones) in the update file's shape. */
export async function exportVariantSheet(client: DbClient, opts: { slugs?: string[] } = {}): Promise<string> {
  const products = await client.product.findMany({
    where: opts.slugs ? { slug: { in: opts.slugs } } : { status: { not: "archived" } },
    orderBy: { slug: "asc" },
    select: { slug: true, variants: { orderBy: { sku: "asc" }, select: { sku: true, name: true, pricePaise: true, compareAtPaise: true, isDefault: true } } },
  });
  const lines = [VARIANT_UPDATE_HEADER.join(",")];
  for (const p of products) {
    for (const v of p.variants) {
      lines.push([
        p.slug, v.sku, v.name, v.isDefault ? "yes" : "", rupees(v.compareAtPaise), rupees(v.pricePaise),
        rupees(v.compareAtPaise), rupees(v.pricePaise), "",
      ].map(csvCell).join(","));
    }
  }
  return lines.join("\n") + "\n";
}

/* ------------------------------------------------------------------ */
/* Shelf counts                                                        */
/* ------------------------------------------------------------------ */

async function readStockWorld(client: DbClient, rows: StockCountRow[]) {
  const [variants, warehouses] = await Promise.all([
    client.productVariant.findMany({
      where: { sku: { in: [...new Set(rows.map((r) => r.sku))], mode: "insensitive" } },
      select: { id: true, sku: true, inventory: { select: { warehouseId: true, qtyOnHand: true, qtyReserved: true } } },
    }),
    client.warehouse.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  const byName = new Map<string, { id: string; name: string }[]>();
  for (const w of warehouses) byName.set(w.name.trim().toLowerCase(), [...(byName.get(w.name.trim().toLowerCase()) ?? []), w]);
  return { variants: new Map(variants.map((v) => [v.sku.toLowerCase(), v])), warehouses: byName };
}

export async function planStockCounts(
  client: DbClient,
  parsed: { rows: StockCountRow[]; issues: UpdateIssue[] }
): Promise<UpdatePlan> {
  const world = await readStockWorld(client, parsed.rows);
  const out: PlannedRow[] = [];
  for (const r of parsed.rows) {
    const base = { line: r.line, scope: r.warehouse, sku: r.sku, changes: [] as FieldChange[] };
    const refuse = (action: "invalid" | "conflict", message: string) => out.push({ ...base, action, message });
    const variant = world.variants.get(r.sku.toLowerCase());
    if (!variant) { refuse("invalid", `No variant has the SKU "${r.sku}"`); continue; }
    const named = world.warehouses.get(r.warehouse.toLowerCase()) ?? [];
    if (named.length === 0) { refuse("invalid", `No active warehouse is called "${r.warehouse}"`); continue; }
    if (named.length > 1) { refuse("conflict", `Two active warehouses are called "${r.warehouse}"; rename one first`); continue; }
    const inv = variant.inventory.find((i) => i.warehouseId === named[0].id);
    if (!inv) {
      if (r.currentOnHand !== null) {
        refuse("conflict", `There is no stock record for this SKU here, but the row says ${r.currentOnHand} on hand. Export again`);
        continue;
      }
      out.push({ ...base, action: "create", changes: [{ field: "qtyOnHand", from: null, to: r.countedQty }] });
      continue;
    }
    if (r.countedQty === inv.qtyOnHand) { out.push({ ...base, action: "unchanged" }); continue; }
    if (r.currentOnHand === null) {
      refuse("conflict", `A stock record exists (${inv.qtyOnHand} on hand). Put that in current_on_hand to replace it with the count`);
      continue;
    }
    if (r.currentOnHand !== inv.qtyOnHand) {
      refuse("conflict", `Stock moved since the export: ${inv.qtyOnHand} on hand now, not ${r.currentOnHand}. Recount or export again`);
      continue;
    }
    if (r.countedQty < inv.qtyReserved) {
      refuse("invalid", `${inv.qtyReserved} units are reserved by open orders, more than the ${r.countedQty} counted. Resolve those orders first`);
      continue;
    }
    out.push({ ...base, action: "update", changes: [{ field: "qtyOnHand", from: inv.qtyOnHand, to: r.countedQty }] });
  }
  return finish(out, parsed.issues);
}

export async function applyStockCounts(
  parsed: { rows: StockCountRow[]; issues: UpdateIssue[] },
  previewedDigest: string,
  actor: { id: string; email: string },
  file: { sha256: string }
): Promise<ApplyResult> {
  try {
    return await db.$transaction(async (tx) => {
      const plan = await planStockCounts(tx, parsed);
      if (!plan.applicable) return { ok: false, reason: "not_applicable", plan } as const;
      if (plan.digest !== previewedDigest) return { ok: false, reason: "plan_changed", plan } as const;
      const world = await readStockWorld(tx, parsed.rows);
      const batchId = randomUUID();
      const byLine = new Map(parsed.rows.map((r) => [r.line, r]));
      for (const p of plan.rows) {
        if (p.action !== "create" && p.action !== "update") continue;
        const r = byLine.get(p.line)!;
        const variant = world.variants.get(r.sku.toLowerCase())!;
        const warehouseId = world.warehouses.get(r.warehouse.toLowerCase())![0].id;
        const note = `Count from file${r.note ? `: ${r.note}` : ""} (batch ${batchId.slice(0, 8)})`;
        if (p.action === "create") {
          await tx.inventory.create({ data: { variantId: variant.id, warehouseId, qtyOnHand: r.countedQty } });
          await tx.stockMovement.create({
            data: { variantId: variant.id, warehouseId, qtyDelta: r.countedQty, qtyAfter: r.countedQty, reason: "recount", note, actorEmail: actor.email },
          });
        } else {
          const from = p.changes[0].from as number;
          /* Only on-hand moves; reservations are the checkout's, and the
             reserved-not-above-on-hand check was made against this same value. */
          const written = await tx.inventory.updateMany({
            where: { variantId: variant.id, warehouseId, qtyOnHand: from, qtyReserved: { lte: r.countedQty } },
            data: { qtyOnHand: r.countedQty },
          });
          if (written.count !== 1) throw new StaleWrite();
          await tx.stockMovement.create({
            data: { variantId: variant.id, warehouseId, qtyDelta: r.countedQty - from, qtyAfter: r.countedQty, reason: "recount", note, actorEmail: actor.email },
          });
        }
      }
      await recordAudit(tx, {
        actorType: "admin", actorId: actor.id, action: "catalogue.update_file_applied", entityType: "catalogue_update", entityId: batchId,
        after: { kind: "stock", fileSha256: file.sha256, digest: plan.digest, counts: plan.counts, by: actor.email },
      });
      return { ok: true, batchId, created: plan.counts.create, updated: plan.counts.update, unchanged: plan.counts.unchanged } as const;
    });
  } catch (e) {
    if (e instanceof StaleWrite) return { ok: false, reason: "stale" };
    throw e;
  }
}

/** The stock sheet for the given SKUs (or every active variant), current figures filled in. */
export async function exportStockSheet(client: DbClient): Promise<string> {
  const rows = await client.inventory.findMany({
    where: { warehouse: { isActive: true }, variant: { product: { status: { not: "archived" } } } },
    orderBy: [{ variant: { sku: "asc" } }],
    select: { qtyOnHand: true, variant: { select: { sku: true } }, warehouse: { select: { name: true } } },
  });
  const lines = [STOCK_COUNT_HEADER.join(",")];
  for (const r of rows) lines.push([r.variant.sku, r.warehouse.name, "", r.qtyOnHand, ""].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
