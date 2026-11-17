import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/prisma/generated/client/client";
import { db } from "@/lib/db";
import type { DbClient } from "@/lib/services/audit";
import { QA_FIXTURE_PREFIX } from "@/lib/catalog/qa-fixture-ids";

/**
 * A one-time reset of the previous catalogue — planned, applied, and undone.
 *
 * This is deliberately not a button. It runs from `scripts/catalogue-reset.mts`
 * against a database somebody names, after they have read the manifest it
 * produced. The dashboard has no "delete the catalogue" action and should
 * never get one.
 *
 * THREE STEPS
 *
 *   plan     read-only (the transaction is SET READ ONLY). Every product made
 *            before the cutoff is classified, with the references that decided
 *            it. The plan has a digest; nothing can be applied without it.
 *   apply    re-plans inside one SERIALIZABLE transaction and refuses unless the
 *            digest is the one the operator approved — a database that moved
 *            since the manifest was read is not the database they approved.
 *            The recovery record is handed to the caller BEFORE any write.
 *   restore  puts back exactly the rows the recovery record holds. Idempotent:
 *            a row already restored, or never changed, is left alone.
 *
 * WHAT HAPPENS TO EACH PRODUCT, AND WHY THAT AND NOT SOMETHING ELSE
 *
 *   retire   Anything history points at: an order line (the foreign key
 *            refuses a delete anyway), a stock movement (it would cascade away
 *            with the variant and the ledger would stop adding up), stock on
 *            hand, an enquiry, a recorded identity or photo approval, or a
 *            photo URL another product also uses. Status → archived, and the
 *            web address and item codes get a `--legacy-YYYYMMDD` suffix so the
 *            same real product can be listed again under its own name. Old
 *            orders keep resolving: an order line points at the variant by id
 *            and carries its own snapshot of title, pack and price.
 *   remove   Nothing points at it but the audit log (which has no foreign key
 *            and is never deleted). The product row goes, and its variants,
 *            photos rows, zero-stock records, express pincodes, price tiers and
 *            cart lines go with it by cascade. Stored image files are not
 *            touched — the image bucket is create-only.
 *   exclude  Not in the reset, and the manifest says why: made at or after the
 *            cutoff, a staging QA fixture, in an order that is still open, or
 *            already retired by an earlier reset.
 *
 * Categories, brands, warehouses, service areas, Launch Control settings,
 * orders, payments, refunds, returns, the stock ledger and the audit log are
 * never written. Apply counts them before and after, inside the transaction,
 * and rolls back if any of them changed.
 */

export const RESET_APPLIED = "catalogue.reset_applied";
export const RESET_RESTORED = "catalogue.reset_restored";

export type ResetAction = "retire" | "remove" | "exclude";
export type ResetSource = "seed" | "range_import" | "qa_fixture" | "dashboard_or_csv" | "unknown";

export interface ResetReferences {
  orderLines: number;
  openOrderLines: number;
  refundsOnTheseOrders: number;
  returnLines: number;
  shipmentLines: number;
  stockMovements: number;
  unitsOnHand: number;
  enquiries: number;
  identityConfirmed: boolean;
  approvedPhotos: number;
  /** Other products using one of this product's photo URLs. */
  sharedPhotoWith: string[];
  cartLines: number;
  wishlistEntries: number;
  auditRows: number;
}

export interface ResetEntry {
  id: string;
  slug: string;
  title: string;
  status: string;
  createdAt: string;
  skus: string[];
  source: ResetSource;
  /** How the source was established, in words. */
  identifiedBy: string;
  references: ResetReferences;
  action: ResetAction;
  reason: string;
  /** Retire only: what the web address and item codes become. */
  retiredSlug?: string;
  retiredSkus?: Record<string, string>;
}

export interface PreservedCounts {
  [table: string]: number;
}

export interface ResetPlan {
  cutoff: string;
  tag: string;
  entries: ResetEntry[];
  summary: Record<ResetAction, number>;
  preserved: PreservedCounts;
  /** sha256 over the entries. The apply step needs exactly this value. */
  digest: string;
}

/** Tables the reset must never change, and the row count each must keep. `audit_logs` may only grow. */
const PRESERVED_TABLES = [
  "categories", "brands", "warehouses", "serviceable_pincodes", "service_cities", "settings",
  "orders", "order_items", "order_status_events", "payments", "payment_refunds",
  "return_requests", "return_request_items", "shipments", "shipment_items",
  "stock_movements", "product_enquiries", "audit_logs",
] as const;

const OPEN_ORDER_STATUSES = ["pending_payment", "confirmed", "packed", "out_for_delivery", "refund_initiated"];

/** `--legacy-20261117` from a cutoff. */
export function resetTag(cutoff: Date): string {
  return `legacy-${cutoff.toISOString().slice(0, 10).replace(/-/g, "")}`;
}

interface Row {
  id: string;
  slug: string;
  title: string;
  status: string;
  created_at: Date;
  skus: string[];
  order_lines: number;
  open_order_lines: number;
  refunds: number;
  return_lines: number;
  shipment_lines: number;
  movements: number;
  on_hand: number;
  enquiries: number;
  identity_confirmed: boolean;
  approved_photos: number;
  shared_with: string[];
  cart_lines: number;
  wishlist: number;
  audit_rows: number;
  range_imported: boolean;
  listed_from_console: boolean;
}

async function readRows(client: DbClient, cutoff: Date): Promise<{ rows: Row[]; after: number }> {
  const rows = await client.$queryRaw<Row[]>`
    SELECT p.id::text, p.slug, p.title, p.status::text, p.created_at,
      COALESCE((SELECT array_agg(v.sku ORDER BY v.sku) FROM product_variants v WHERE v.product_id = p.id), '{}') AS skus,
      (SELECT count(*)::int FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id WHERE v.product_id = p.id) AS order_lines,
      (SELECT count(*)::int FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id JOIN orders o ON o.id = oi.order_id
         WHERE v.product_id = p.id AND o.status::text = ANY(${OPEN_ORDER_STATUSES})) AS open_order_lines,
      (SELECT count(*)::int FROM payment_refunds r WHERE r.order_id IN
         (SELECT oi.order_id FROM order_items oi JOIN product_variants v ON v.id = oi.variant_id WHERE v.product_id = p.id)) AS refunds,
      (SELECT count(*)::int FROM return_request_items ri JOIN order_items oi ON oi.id = ri.order_item_id
         JOIN product_variants v ON v.id = oi.variant_id WHERE v.product_id = p.id) AS return_lines,
      (SELECT count(*)::int FROM shipment_items si JOIN order_items oi ON oi.id = si.order_item_id
         JOIN product_variants v ON v.id = oi.variant_id WHERE v.product_id = p.id) AS shipment_lines,
      (SELECT count(*)::int FROM stock_movements m JOIN product_variants v ON v.id = m.variant_id WHERE v.product_id = p.id) AS movements,
      (SELECT COALESCE(sum(i.qty_on_hand), 0)::int FROM inventory i JOIN product_variants v ON v.id = i.variant_id WHERE v.product_id = p.id) AS on_hand,
      (SELECT count(*)::int FROM product_enquiries e WHERE e.product_id = p.id) AS enquiries,
      p.identity_confirmed,
      (SELECT count(*)::int FROM product_images i WHERE i.product_id = p.id
         AND (i.identity_approved OR i.approval_status::text <> 'REVIEW_REQUIRED')) AS approved_photos,
      COALESCE((SELECT array_agg(DISTINCT o.slug ORDER BY o.slug) FROM product_images i
         JOIN product_images j ON j.url = i.url AND j.product_id <> i.product_id
         JOIN products o ON o.id = j.product_id WHERE i.product_id = p.id), '{}') AS shared_with,
      (SELECT count(*)::int FROM cart_items c JOIN product_variants v ON v.id = c.variant_id WHERE v.product_id = p.id) AS cart_lines,
      (SELECT count(*)::int FROM wishlist_items w WHERE w.product_id = p.id) AS wishlist,
      (SELECT count(*)::int FROM audit_logs a WHERE a.entity_id = p.id::text) AS audit_rows,
      EXISTS (SELECT 1 FROM audit_logs a WHERE a.entity_id = p.id::text AND a.action = 'catalogue.range_imported') AS range_imported,
      EXISTS (SELECT 1 FROM audit_logs a WHERE a.entity_id = p.id::text AND a.action = 'catalog.product_listed') AS listed_from_console
    FROM products p
    WHERE p.created_at < ${cutoff}
    ORDER BY p.created_at, p.slug`;
  const [{ n }] = await client.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM products WHERE created_at >= ${cutoff}`;
  return { rows, after: n };
}

function classify(r: Row, seedSlugs: ReadonlySet<string>, tag: string): ResetEntry {
  const references: ResetReferences = {
    orderLines: r.order_lines, openOrderLines: r.open_order_lines, refundsOnTheseOrders: r.refunds,
    returnLines: r.return_lines, shipmentLines: r.shipment_lines, stockMovements: r.movements,
    unitsOnHand: r.on_hand, enquiries: r.enquiries, identityConfirmed: r.identity_confirmed,
    approvedPhotos: r.approved_photos, sharedPhotoWith: r.shared_with, cartLines: r.cart_lines,
    wishlistEntries: r.wishlist, auditRows: r.audit_rows,
  };
  const qa = r.slug.startsWith(QA_FIXTURE_PREFIX);
  const [source, identifiedBy]: [ResetSource, string] = qa
    ? ["qa_fixture", `web address starts with ${QA_FIXTURE_PREFIX}`]
    : r.range_imported
      ? ["range_import", "audit row catalogue.range_imported (scripts/import-catalogue-ranges.mts)"]
      : seedSlugs.has(r.slug)
        ? ["seed", "web address is one of the demo products in prisma/seed.ts"]
        : r.listed_from_console
          ? ["dashboard_or_csv", "audit row catalog.product_listed (listing form or CSV import)"]
          : ["unknown", "no import record; created before the cutoff"];
  const base = {
    id: r.id, slug: r.slug, title: r.title, status: r.status, createdAt: r.created_at.toISOString(),
    skus: r.skus, source, identifiedBy, references,
  };

  if (r.status === "archived" && r.slug.includes("--legacy-")) {
    return { ...base, action: "exclude", reason: "Already retired by an earlier reset." };
  }
  if (qa) {
    return {
      ...base, action: "exclude",
      reason: "Staging test fixture used by the payment and UAT scripts. Never shown on a production deployment (QA_FIXTURE_PREFIX) and recreated by npm run qa:fixture, so it is left to those scripts.",
    };
  }
  if (r.open_order_lines > 0) {
    return { ...base, action: "exclude", reason: `In ${r.open_order_lines} order line(s) that are still open. Retire it once those orders are delivered or cancelled.` };
  }

  const why = [
    r.order_lines ? `${r.order_lines} order line(s)` : null,
    r.movements ? `${r.movements} stock movement(s)` : null,
    r.on_hand ? `${r.on_hand} unit(s) on hand` : null,
    r.enquiries ? `${r.enquiries} enquiry(ies)` : null,
    r.identity_confirmed || r.approved_photos ? "a recorded identity or photo approval" : null,
    r.shared_with.length ? `a photo also used by ${r.shared_with.join(", ")}` : null,
  ].filter((x): x is string => x !== null);

  if (why.length > 0) {
    return {
      ...base, action: "retire",
      reason: `Kept and archived because history refers to it: ${why.join("; ")}.`,
      retiredSlug: `${r.slug}--${tag}`,
      retiredSkus: Object.fromEntries(r.skus.map((s) => [s, `${s}--${tag.toUpperCase()}`])),
    };
  }
  return {
    ...base, action: "remove",
    reason: "Nothing refers to it except the audit log, which is kept. Removed with its packs, photo rows, zero-stock records and cart lines.",
  };
}

async function preservedCounts(client: DbClient): Promise<PreservedCounts> {
  const out: PreservedCounts = {};
  for (const t of PRESERVED_TABLES) {
    const [{ n }] = await client.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${t}"`);
    out[t] = n;
  }
  return out;
}

export function planDigest(entries: readonly ResetEntry[]): string {
  /* Over what the reset would do and why, not when it was read. */
  const stable = [...entries]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) => [e.id, e.slug, e.status, e.skus, e.action, e.references, e.retiredSlug ?? null, e.retiredSkus ?? null]);
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

async function buildPlan(client: DbClient, cutoff: Date, seedSlugs: ReadonlySet<string>): Promise<ResetPlan & { createdAfterCutoff: number }> {
  const tag = resetTag(cutoff);
  const { rows, after } = await readRows(client, cutoff);
  const entries = rows.map((r) => classify(r, seedSlugs, tag));
  const summary = { retire: 0, remove: 0, exclude: 0 } as Record<ResetAction, number>;
  for (const e of entries) summary[e.action] += 1;
  return { cutoff: cutoff.toISOString(), tag, entries, summary, preserved: await preservedCounts(client), digest: planDigest(entries), createdAfterCutoff: after };
}

/** The read-only plan. Nothing can be written: the transaction is declared READ ONLY. */
export async function planCatalogueReset(cutoff: Date, seedSlugs: ReadonlySet<string>, client = db) {
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return buildPlan(tx, cutoff, seedSlugs);
  });
}

/* ------------------------------------------------------------------ */
/* Recovery                                                            */
/* ------------------------------------------------------------------ */

/** Every row the apply step changes or deletes, exactly as it was. */
export interface ResetRecovery {
  digest: string;
  cutoff: string;
  capturedAt: string;
  retired: { product: Record<string, unknown>; variants: Record<string, unknown>[] }[];
  removed: {
    products: Record<string, unknown>[];
    product_variants: Record<string, unknown>[];
    product_images: Record<string, unknown>[];
    product_express_pincodes: Record<string, unknown>[];
    inventory: Record<string, unknown>[];
    bulk_price_tiers: Record<string, unknown>[];
    cart_items: Record<string, unknown>[];
    wishlist_items: Record<string, unknown>[];
  };
}

async function rowsOf(client: DbClient, sql: string, ids: string[]): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const r = await client.$queryRawUnsafe<{ j: Record<string, unknown> }[]>(sql, ids);
  return r.map((x) => x.j);
}

async function captureRecovery(client: DbClient, plan: ResetPlan): Promise<ResetRecovery> {
  const retireIds = plan.entries.filter((e) => e.action === "retire").map((e) => e.id);
  const removeIds = plan.entries.filter((e) => e.action === "remove").map((e) => e.id);
  const products = await rowsOf(client, `SELECT row_to_json(p) AS j FROM products p WHERE p.id = ANY($1::uuid[])`, retireIds);
  const variants = await rowsOf(client, `SELECT row_to_json(v) AS j FROM product_variants v WHERE v.product_id = ANY($1::uuid[])`, retireIds);
  const byVariant = (table: string) =>
    rowsOf(client, `SELECT row_to_json(t) AS j FROM ${table} t WHERE t.variant_id IN (SELECT id FROM product_variants WHERE product_id = ANY($1::uuid[]))`, removeIds);
  return {
    digest: plan.digest,
    cutoff: plan.cutoff,
    capturedAt: new Date().toISOString(),
    retired: products.map((p) => ({ product: p, variants: variants.filter((v) => v.product_id === p.id) })),
    removed: {
      products: await rowsOf(client, `SELECT row_to_json(p) AS j FROM products p WHERE p.id = ANY($1::uuid[])`, removeIds),
      product_variants: await rowsOf(client, `SELECT row_to_json(v) AS j FROM product_variants v WHERE v.product_id = ANY($1::uuid[])`, removeIds),
      product_images: await rowsOf(client, `SELECT row_to_json(i) AS j FROM product_images i WHERE i.product_id = ANY($1::uuid[])`, removeIds),
      product_express_pincodes: await rowsOf(client, `SELECT row_to_json(x) AS j FROM product_express_pincodes x WHERE x.product_id = ANY($1::uuid[])`, removeIds),
      inventory: await byVariant("inventory"),
      bulk_price_tiers: await byVariant("bulk_price_tiers"),
      cart_items: await byVariant("cart_items"),
      wishlist_items: await rowsOf(client, `SELECT row_to_json(w) AS j FROM wishlist_items w WHERE w.product_id = ANY($1::uuid[])`, removeIds),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Apply                                                               */
/* ------------------------------------------------------------------ */

export class ResetRefused extends Error {}

export interface ApplyResult {
  digest: string;
  retired: number;
  removed: number;
  excluded: number;
}

/**
 * Apply the approved plan. `onRecovery` receives the recovery record before
 * any write; if it throws, nothing is written. If the transaction then fails,
 * the recovery record describes rows that never changed, and restoring it is a
 * no-op.
 */
export async function applyCatalogueReset(params: {
  cutoff: Date;
  seedSlugs: ReadonlySet<string>;
  approvedDigest: string;
  onRecovery: (r: ResetRecovery) => void | Promise<void>;
  client?: typeof db;
}): Promise<ApplyResult> {
  const client = params.client ?? db;
  return client.$transaction(
    async (tx) => {
      const plan = await buildPlan(tx, params.cutoff, params.seedSlugs);
      if (plan.digest !== params.approvedDigest) {
        throw new ResetRefused(
          `The catalogue changed since the manifest was produced (approved ${params.approvedDigest.slice(0, 12)}, now ${plan.digest.slice(0, 12)}). Nothing was written. Produce a new manifest and review it.`
        );
      }
      await params.onRecovery(await captureRecovery(tx, plan));

      for (const e of plan.entries) {
        if (e.action === "retire") {
          for (const [from, to] of Object.entries(e.retiredSkus ?? {})) {
            await tx.$executeRaw`UPDATE product_variants SET sku = ${to}, updated_at = now() WHERE product_id = ${e.id}::uuid AND sku = ${from}`;
          }
          await tx.$executeRaw`UPDATE products SET status = 'archived', slug = ${e.retiredSlug!}, updated_at = now() WHERE id = ${e.id}::uuid`;
          await tx.auditLog.create({
            data: {
              actorType: "system", action: "catalogue.reset_retired", entityType: "product", entityId: e.id,
              before: { status: e.status, slug: e.slug, skus: e.skus },
              after: { status: "archived", slug: e.retiredSlug!, skus: e.retiredSkus!, reason: e.reason, digest: plan.digest },
            },
          });
        } else if (e.action === "remove") {
          await tx.$executeRaw`DELETE FROM wishlist_items WHERE product_id = ${e.id}::uuid`;
          await tx.$executeRaw`DELETE FROM products WHERE id = ${e.id}::uuid`;
          await tx.auditLog.create({
            data: {
              actorType: "system", action: "catalogue.reset_removed", entityType: "product", entityId: e.id,
              before: { status: e.status, slug: e.slug, title: e.title, skus: e.skus },
              after: { reason: e.reason, digest: plan.digest },
            },
          });
        }
      }

      const after = await preservedCounts(tx);
      for (const t of PRESERVED_TABLES) {
        const ok = t === "audit_logs" ? after[t] >= plan.preserved[t] : after[t] === plan.preserved[t];
        if (!ok) throw new ResetRefused(`${t} changed from ${plan.preserved[t]} to ${after[t]} rows. Rolled back; nothing was written.`);
      }
      await tx.auditLog.create({
        data: {
          actorType: "system", action: RESET_APPLIED, entityType: "catalogue_reset", entityId: plan.digest,
          after: { cutoff: plan.cutoff, summary: plan.summary } as Prisma.InputJsonValue,
        },
      });
      return { digest: plan.digest, retired: plan.summary.retire, removed: plan.summary.remove, excluded: plan.summary.exclude };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 600_000, maxWait: 30_000 }
  );
}

/* ------------------------------------------------------------------ */
/* Restore                                                             */
/* ------------------------------------------------------------------ */

export interface RestoreResult {
  retiredRestored: number;
  removedRestored: number;
  alreadyInPlace: number;
}

async function insertMissing(client: DbClient, table: string, rows: Record<string, unknown>[]): Promise<number> {
  if (rows.length === 0) return 0;
  return client.$executeRawUnsafe(
    `INSERT INTO ${table} SELECT r.* FROM json_populate_recordset(NULL::${table}, $1::json) r
     WHERE NOT EXISTS (SELECT 1 FROM ${table} t WHERE t.id = r.id)`,
    JSON.stringify(rows)
  );
}

/** Undo an apply from its recovery record. One transaction; safe to run twice. */
export async function restoreCatalogueReset(recovery: ResetRecovery, client = db): Promise<RestoreResult> {
  return client.$transaction(
    async (tx) => {
      /* A product listed again since the reset may now hold an old web address
         or item code. Restoring over it would fail on the unique index half-way,
         so every clash is named first and nothing is written. */
      const clashes: string[] = [];
      for (const { product, variants } of recovery.retired) {
        const [taken] = await tx.$queryRaw<{ title: string }[]>`
          SELECT title FROM products WHERE slug = ${String(product.slug)} AND id <> ${String(product.id)}::uuid`;
        if (taken) clashes.push(`web address ${String(product.slug)} is now used by "${taken.title}"`);
        for (const v of variants) {
          const [sku] = await tx.$queryRaw<{ n: number }[]>`
            SELECT count(*)::int AS n FROM product_variants WHERE sku = ${String(v.sku)} AND id <> ${String(v.id)}::uuid`;
          if (sku.n > 0) clashes.push(`item code ${String(v.sku)} is now used by another product`);
        }
      }
      for (const p of recovery.removed.products) {
        const [taken] = await tx.$queryRaw<{ title: string }[]>`
          SELECT title FROM products WHERE slug = ${String(p.slug)} AND id <> ${String(p.id)}::uuid`;
        if (taken) clashes.push(`web address ${String(p.slug)} is now used by "${taken.title}"`);
      }
      for (const v of recovery.removed.product_variants) {
        const [sku] = await tx.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM product_variants WHERE sku = ${String(v.sku)} AND id <> ${String(v.id)}::uuid`;
        if (sku.n > 0) clashes.push(`item code ${String(v.sku)} is now used by another product`);
      }
      if (clashes.length > 0) {
        throw new ResetRefused(
          `Nothing was restored. Products listed since the reset use ${clashes.length} of the old names: ${clashes.slice(0, 10).join("; ")}` +
            `${clashes.length > 10 ? "; …" : ""}. Archive and rename those products first, or restore from the database backup.`
        );
      }

      let retiredRestored = 0;
      let alreadyInPlace = 0;
      for (const { product, variants } of recovery.retired) {
        const [now] = await tx.$queryRaw<{ slug: string }[]>`SELECT slug FROM products WHERE id = ${String(product.id)}::uuid`;
        if (!now || now.slug === product.slug) {
          alreadyInPlace += 1;
          continue;
        }
        /* Item codes first: changing one clears the product's price review by
           trigger, and the product row below then puts the review back. */
        await tx.$executeRawUnsafe(
          `UPDATE product_variants v SET sku = r.sku, updated_at = r.updated_at
           FROM json_populate_recordset(NULL::product_variants, $1::json) r WHERE v.id = r.id`,
          JSON.stringify(variants)
        );
        await tx.$executeRawUnsafe(
          `UPDATE products p SET status = r.status, slug = r.slug, commercial_review = r.commercial_review, updated_at = r.updated_at
           FROM json_populate_record(NULL::products, $1::json) r WHERE p.id = r.id`,
          JSON.stringify(product)
        );
        retiredRestored += 1;
      }

      const r = recovery.removed;
      const removedRestored = await insertMissing(tx, "products", r.products);
      alreadyInPlace += r.products.length - removedRestored;
      await insertMissing(tx, "product_variants", r.product_variants);
      await insertMissing(tx, "product_images", r.product_images);
      await insertMissing(tx, "product_express_pincodes", r.product_express_pincodes);
      await insertMissing(tx, "inventory", r.inventory);
      await insertMissing(tx, "bulk_price_tiers", r.bulk_price_tiers);
      await insertMissing(tx, "cart_items", r.cart_items);
      await insertMissing(tx, "wishlist_items", r.wishlist_items);
      /* Inserting a pack clears the product's price review by trigger; put it back. */
      if (r.products.length > 0) {
        await tx.$executeRawUnsafe(
          `UPDATE products p SET commercial_review = r.commercial_review, updated_at = r.updated_at
           FROM json_populate_recordset(NULL::products, $1::json) r WHERE p.id = r.id`,
          JSON.stringify(r.products)
        );
      }
      await tx.auditLog.create({
        data: {
          actorType: "system", action: RESET_RESTORED, entityType: "catalogue_reset", entityId: recovery.digest,
          after: { retiredRestored, removedRestored, alreadyInPlace },
        },
      });
      return { retiredRestored, removedRestored, alreadyInPlace };
    },
    { timeout: 600_000, maxWait: 30_000 }
  );
}

/**
 * Whether a reset is in force on this database: applied and not since restored.
 * The demo seed and the range import check this, because after a reset either
 * would bring the old products back under their freed web addresses.
 */
export async function catalogueResetInForce(client: DbClient = db): Promise<boolean> {
  const last = await client.auditLog.findFirst({
    where: { action: { in: [RESET_APPLIED, RESET_RESTORED] } },
    orderBy: { createdAt: "desc" },
    select: { action: true },
  });
  return last?.action === RESET_APPLIED;
}

/** A per-table fingerprint, to show that a restore put everything back. Excludes the audit log, which only grows. */
export async function catalogueFingerprint(client: DbClient = db): Promise<Record<string, string>> {
  const tables = [
    "products", "product_variants", "product_images", "product_express_pincodes", "inventory", "bulk_price_tiers",
    "cart_items", "wishlist_items", ...PRESERVED_TABLES.filter((t) => t !== "audit_logs"),
  ];
  const out: Record<string, string> = {};
  for (const t of tables) {
    const [{ h }] = await client.$queryRawUnsafe<{ h: string | null }[]>(
      `SELECT md5(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text))) AS h FROM "${t}" t`
    );
    out[t] = h ?? "empty";
  }
  return out;
}
