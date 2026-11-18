import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/prisma/generated/client/client";
import { db } from "@/lib/db";
import type { DbClient } from "@/lib/services/audit";
import { QA_FIXTURE_PREFIX } from "@/lib/catalog/qa-fixture-ids";
import { publicProductWhere } from "@/lib/catalog-policy";
import { retiredSku } from "@/lib/retired-sku";

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
  /**
   * md5 of the product row, its packs, photos, stock records and express
   * pincodes as read. Part of the digest, so any edit to the product between
   * the manifest and the apply — a price, a photo, a status — refuses the apply.
   */
  state: string;
  /**
   * Retire only: archive but keep the web address and item codes. Used for
   * staging QA fixtures, which the payment and UAT scripts find by name.
   */
  keepNames?: boolean;
  /** Retire only: what the web address and item codes become. */
  retiredSlug?: string;
  retiredSkus?: Record<string, string>;
}

export interface PreservedCounts {
  [table: string]: number;
}

/** Content hash of each table the reset must not change (the audit log excluded: it may only grow). */
export interface PreservedContent {
  [table: string]: string;
}

/**
 * Which database this is, as precisely as the connection can say: the host and
 * port it answers on, the database name it reports, and its Supabase project
 * ref when it has one. Two local clones differ by name; two projects by ref.
 */
export interface DatabaseIdentity {
  id: string;
  ref: string;
  database: string;
}

export interface ResetOptions {
  /** Archive `qa-staging-*` fixtures (keeping their names) instead of leaving them. Staging only. */
  archiveQaFixtures: boolean;
}

export interface ResetPlan {
  cutoff: string;
  options: ResetOptions;
  tag: string;
  entries: ResetEntry[];
  summary: Record<ResetAction, number>;
  preserved: PreservedCounts;
  preservedContent: PreservedContent;
  /** Products that customers will still see once the reset is applied — should be only the launch catalogue. */
  remainingVisible: { id: string; slug: string; title: string; status: string; why: string }[];
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
  state: string;
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
      EXISTS (SELECT 1 FROM audit_logs a WHERE a.entity_id = p.id::text AND a.action = 'catalog.product_listed') AS listed_from_console,
      md5(concat_ws('|',
        (SELECT row_to_json(x)::text FROM products x WHERE x.id = p.id),
        (SELECT string_agg(row_to_json(v)::text, ',' ORDER BY v.id) FROM product_variants v WHERE v.product_id = p.id),
        (SELECT string_agg(row_to_json(i)::text, ',' ORDER BY i.id) FROM product_images i WHERE i.product_id = p.id),
        (SELECT string_agg(row_to_json(n)::text, ',' ORDER BY n.id) FROM inventory n JOIN product_variants v ON v.id = n.variant_id WHERE v.product_id = p.id),
        (SELECT string_agg(row_to_json(e)::text, ',' ORDER BY e.id) FROM product_express_pincodes e WHERE e.product_id = p.id)
      )) AS state
    FROM products p
    WHERE p.created_at < ${cutoff}
    ORDER BY p.created_at, p.slug`;
  const [{ n }] = await client.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM products WHERE created_at >= ${cutoff}`;
  return { rows, after: n };
}

function classify(r: Row, seedSlugs: ReadonlySet<string>, tag: string, cutoff: Date, options: ResetOptions): ResetEntry {
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
    skus: r.skus, source, identifiedBy, references, state: r.state,
  };

  if (r.status === "archived" && r.slug.includes("--legacy-")) {
    return { ...base, action: "exclude", reason: "Already retired by an earlier reset." };
  }
  if (qa && options.archiveQaFixtures) {
    if (r.status === "archived") return { ...base, action: "exclude", reason: "QA fixture already archived." };
    const refs = [
      r.order_lines ? `${r.order_lines} order line(s)${r.open_order_lines ? `, ${r.open_order_lines} still open` : ""}` : null,
      r.movements ? `${r.movements} stock movement(s)` : null,
      r.refunds ? `${r.refunds} refund(s)` : null,
    ].filter(Boolean).join("; ");
    return {
      ...base, action: "retire", keepNames: true, retiredSlug: r.slug, retiredSkus: Object.fromEntries(r.skus.map((s) => [s, s])),
      reason:
        "Staging QA fixture, archived so customers see only launch products. Its web address and item codes are kept " +
        "because npm run qa:fixture finds it by them." + (refs ? ` Its history stays attached: ${refs}. Archiving changes no order.` : ""),
    };
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
      retiredSkus: Object.fromEntries(r.skus.map((s) => [s, retiredSku(s, cutoff)])),
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

async function preservedContent(client: DbClient): Promise<PreservedContent> {
  const out: PreservedContent = {};
  for (const t of PRESERVED_TABLES) {
    if (t === "audit_logs") continue;
    const [{ h }] = await client.$queryRawUnsafe<{ h: string | null }[]>(
      `SELECT md5(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text))) AS h FROM "${t}" t`
    );
    out[t] = h ?? "empty";
  }
  return out;
}

/** What customers see now that the reset would not touch: excluded products and products made after the cutoff. */
async function remainingVisible(client: DbClient, entries: readonly ResetEntry[]) {
  const touched = entries.filter((e) => e.action !== "exclude").map((e) => e.id);
  const visible = await client.product.findMany({
    where: { AND: [publicProductWhere(), { id: { notIn: touched } }] },
    select: { id: true, slug: true, title: true, status: true },
    orderBy: { slug: "asc" },
  });
  const why = new Map(entries.map((e) => [e.id, e.reason]));
  return visible.map((p) => ({ ...p, why: why.get(p.id) ?? "Made after the cutoff, so treated as the new catalogue." }));
}

export async function databaseIdentity(client: DbClient, url: string | undefined = process.env.DATABASE_URL): Promise<DatabaseIdentity> {
  const [{ name, port }] = await client.$queryRaw<{ name: string; port: number | null }[]>`
    SELECT current_database() AS name, inet_server_port() AS port`;
  let host = "unknown";
  let ref = "unknown";
  try {
    const u = new URL(url ?? "");
    host = u.hostname;
    const supa = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname)?.[1] ?? /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(u.username))?.[1];
    ref = supa ?? (["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname) ? "localhost" : "unknown-remote");
  } catch {
    /* identity stays partly unknown, and so matches nothing else */
  }
  /* The pooler hides the server port; the project ref and database name identify a Supabase database. */
  const id = ref !== "localhost" && ref !== "unknown-remote" ? `supabase:${ref}/${name}` : `${ref}:${host}:${port ?? "?"}/${name}`;
  return { id, ref, database: name };
}

export function planDigest(entries: readonly ResetEntry[]): string {
  /* Over what the reset would do and why, not when it was read. */
  const stable = [...entries]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) => [e.id, e.slug, e.status, e.skus, e.action, e.references, e.state, e.keepNames ?? false, e.retiredSlug ?? null, e.retiredSkus ?? null]);
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

const NO_OPTIONS: ResetOptions = { archiveQaFixtures: false };

async function buildPlan(client: DbClient, cutoff: Date, seedSlugs: ReadonlySet<string>, options: ResetOptions): Promise<ResetPlan & { createdAfterCutoff: number }> {
  const tag = resetTag(cutoff);
  const { rows, after } = await readRows(client, cutoff);
  const entries = rows.map((r) => classify(r, seedSlugs, tag, cutoff, options));
  const summary = { retire: 0, remove: 0, exclude: 0 } as Record<ResetAction, number>;
  for (const e of entries) summary[e.action] += 1;
  return {
    cutoff: cutoff.toISOString(), options, tag, entries, summary,
    preserved: await preservedCounts(client),
    preservedContent: await preservedContent(client),
    remainingVisible: await remainingVisible(client, entries),
    digest: planDigest(entries),
    createdAfterCutoff: after,
  };
}

/** The read-only plan. Nothing can be written: the transaction is declared READ ONLY. */
export async function planCatalogueReset(cutoff: Date, seedSlugs: ReadonlySet<string>, client = db, options: ResetOptions = NO_OPTIONS) {
  /* Read-only, but it reads every product's rows: against a remote database
     this takes well over Prisma's 5-second default, as apply and restore do. */
  return client.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return buildPlan(tx, cutoff, seedSlugs, options);
    },
    { timeout: 600_000, maxWait: 30_000 }
  );
}

/* ------------------------------------------------------------------ */
/* Recovery                                                            */
/* ------------------------------------------------------------------ */

/** Every row the apply step changes or deletes, exactly as it was. */
export interface ResetRecovery {
  digest: string;
  /** The database this was captured from. Restore refuses any other. */
  database: DatabaseIdentity;
  cutoff: string;
  capturedAt: string;
  /** Each retired product as it was, and the web address and codes the apply gave it. */
  retired: { product: Record<string, unknown>; variants: Record<string, unknown>[]; retiredSlug: string; retiredSkus: Record<string, string> }[];
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

async function captureRecovery(client: DbClient, plan: ResetPlan, database: DatabaseIdentity): Promise<ResetRecovery> {
  const retireIds = plan.entries.filter((e) => e.action === "retire").map((e) => e.id);
  const removeIds = plan.entries.filter((e) => e.action === "remove").map((e) => e.id);
  const products = await rowsOf(client, `SELECT row_to_json(p) AS j FROM products p WHERE p.id = ANY($1::uuid[])`, retireIds);
  const variants = await rowsOf(client, `SELECT row_to_json(v) AS j FROM product_variants v WHERE v.product_id = ANY($1::uuid[])`, retireIds);
  const byVariant = (table: string) =>
    rowsOf(client, `SELECT row_to_json(t) AS j FROM ${table} t WHERE t.variant_id IN (SELECT id FROM product_variants WHERE product_id = ANY($1::uuid[]))`, removeIds);
  const planned = new Map(plan.entries.map((e) => [e.id, e]));
  return {
    digest: plan.digest,
    database,
    cutoff: plan.cutoff,
    capturedAt: new Date().toISOString(),
    retired: products.map((p) => ({
      product: p,
      variants: variants.filter((v) => v.product_id === p.id),
      retiredSlug: planned.get(String(p.id))!.retiredSlug!,
      retiredSkus: planned.get(String(p.id))!.retiredSkus!,
    })),
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
  /** The identity recorded in the approved manifest. Apply refuses any other database. */
  approvedDatabaseId: string;
  /** The options the manifest was produced with. Different options produce a different digest. */
  options?: ResetOptions;
  databaseUrl?: string;
  onRecovery: (r: ResetRecovery) => void | Promise<void>;
  client?: typeof db;
}): Promise<ApplyResult> {
  const client = params.client ?? db;
  return client.$transaction(
    async (tx) => {
      const database = await databaseIdentity(tx, params.databaseUrl);
      if (database.id !== params.approvedDatabaseId) {
        throw new ResetRefused(`The manifest was approved for ${params.approvedDatabaseId}, but this is ${database.id}. Nothing was written.`);
      }
      const plan = await buildPlan(tx, params.cutoff, params.seedSlugs, params.options ?? NO_OPTIONS);
      if (plan.digest !== params.approvedDigest) {
        throw new ResetRefused(
          `The approved digest ${params.approvedDigest.slice(0, 12)}… does not match this database, whose plan is now ${plan.digest.slice(0, 12)}…. Either the digest was mistyped or the catalogue changed since the manifest was produced. Nothing was written. Produce a new manifest and review it.`
        );
      }
      await params.onRecovery(await captureRecovery(tx, plan, database));

      for (const e of plan.entries) {
        if (e.action === "retire" && e.keepNames) {
          await tx.$executeRaw`UPDATE products SET status = 'archived', updated_at = now() WHERE id = ${e.id}::uuid`;
          await tx.auditLog.create({
            data: {
              actorType: "system", action: "catalogue.reset_retired", entityType: "product", entityId: e.id,
              before: { status: e.status, slug: e.slug },
              after: { status: "archived", slug: e.slug, namesKept: true, reason: e.reason, digest: plan.digest },
            },
          });
        } else if (e.action === "retire") {
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

      /* Same snapshot, so only this transaction's own writes could differ:
         the row count of the audit log may grow, and every other preserved
         table — categories, brands, Launch Control settings, orders, the
         stock ledger — must be byte-for-byte what it was. */
      const after = await preservedCounts(tx);
      if (after.audit_logs < plan.preserved.audit_logs) throw new ResetRefused("audit_logs shrank. Rolled back; nothing was written.");
      const content = await preservedContent(tx);
      for (const [t, h] of Object.entries(plan.preservedContent)) {
        if (content[t] !== h) throw new ResetRefused(`${t} changed. Rolled back; nothing was written.`);
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

/** The tables restore may insert into. Table names are never taken from the recovery file. */
const RESTORE_TABLES = new Set([
  "products", "product_variants", "product_images", "product_express_pincodes",
  "inventory", "bulk_price_tiers", "cart_items", "wishlist_items",
]);

/** Insert the rows that are not there; return the ids inserted. */
async function insertMissing(client: DbClient, table: string, rows: Record<string, unknown>[]): Promise<string[]> {
  if (!RESTORE_TABLES.has(table)) throw new Error(`restore does not write ${table}`);
  if (rows.length === 0) return [];
  const out = await client.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "${table}" SELECT r.* FROM json_populate_recordset(NULL::"${table}", $1::json) r
     WHERE NOT EXISTS (SELECT 1 FROM "${table}" t WHERE t.id = r.id) RETURNING id::text`,
    JSON.stringify(rows)
  );
  return out.map((x) => x.id);
}

/** Undo an apply from its recovery record. One transaction; safe to run twice. */
export async function restoreCatalogueReset(recovery: ResetRecovery, client = db, databaseUrl?: string): Promise<RestoreResult> {
  return client.$transaction(
    async (tx) => {
      const database = await databaseIdentity(tx, databaseUrl);
      if (recovery.database?.id !== database.id) {
        throw new ResetRefused(`This recovery file belongs to ${recovery.database?.id ?? "an unknown database"}, not ${database.id}. Nothing was restored.`);
      }
      /* A product listed again since the reset may now hold an old web address
         or item code. Restoring over it would fail on the unique index half-way,
         so every clash is named first and nothing is written. */
      const clashes: string[] = [];
      /* A retired product is put back only from exactly the state this apply
         left it in. Anything else — another reset's names, a later edit — is
         named and nothing is written. */
      for (const { product, retiredSlug } of recovery.retired) {
        const [now] = await tx.$queryRaw<{ slug: string }[]>`SELECT slug FROM products WHERE id = ${String(product.id)}::uuid`;
        if (now && now.slug !== retiredSlug && now.slug !== product.slug) {
          clashes.push(`${String(product.slug)} is now ${now.slug}, which this reset did not write`);
        }
      }
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
        const [now] = await tx.$queryRaw<{ slug: string; status: string }[]>`
          SELECT slug, status::text AS status FROM products WHERE id = ${String(product.id)}::uuid`;
        /* Already as it was (or gone): nothing to put back. A product archived
           with its names kept has the same slug before and after, so the
           status decides. */
        if (!now || (now.slug === product.slug && now.status === product.status)) {
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
      const inserted = await insertMissing(tx, "products", r.products);
      const removedRestored = inserted.length;
      alreadyInPlace += r.products.length - removedRestored;
      await insertMissing(tx, "product_variants", r.product_variants);
      await insertMissing(tx, "product_images", r.product_images);
      await insertMissing(tx, "product_express_pincodes", r.product_express_pincodes);
      await insertMissing(tx, "inventory", r.inventory);
      await insertMissing(tx, "bulk_price_tiers", r.bulk_price_tiers);
      await insertMissing(tx, "cart_items", r.cart_items);
      await insertMissing(tx, "wishlist_items", r.wishlist_items);
      /* Inserting a pack clears the product's price review by trigger; put it
         back — only on products this run inserted, so a second restore leaves
         earlier-restored products and any later edits to them alone. */
      const mine = new Set(inserted);
      const ours = r.products.filter((p) => mine.has(String(p.id)));
      if (ours.length > 0) {
        await tx.$executeRawUnsafe(
          `UPDATE products p SET commercial_review = r.commercial_review, updated_at = r.updated_at
           FROM json_populate_recordset(NULL::products, $1::json) r WHERE p.id = r.id`,
          JSON.stringify(ours)
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
  /* Per reset (keyed by its digest): in force while its latest event is the
     apply. Restoring one reset never clears another. */
  const [row] = await client.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM (
      SELECT DISTINCT ON (entity_id) action FROM audit_logs
      WHERE action IN (${RESET_APPLIED}, ${RESET_RESTORED}) AND entity_type = 'catalogue_reset'
      ORDER BY entity_id, created_at DESC
    ) last WHERE action = ${RESET_APPLIED}`;
  return row.n > 0;
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
