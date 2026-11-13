import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { recordAudit, type DbClient } from "@/lib/services/audit";
import { setCategoryActiveTx } from "./categories";
import { setBrandActiveTx } from "./brand-writes";
import { catalogListingWhere } from "@/lib/catalog-policy";
import { orderingOpen } from "@/lib/commerce-mode";
import { strictCatalogue } from "@/lib/deploy-env";
import { CATEGORY_TAX_CONFIGS } from "@/lib/services/tax";
import { explainProducts } from "@/lib/services/catalog-state";
import {
  buildLaunchTree, confirmTextFor, departmentChanges, launchChangeSetSchema, LAUNCH_CATEGORY_LIMIT, LAUNCH_STATUS_ORDER,
  type LaunchCategoryRow, type LaunchChangeSet, type LaunchDepartment, type LaunchPlan, type LaunchPlanRow,
} from "@/lib/launch-control";
import type { CatalogState } from "@/lib/catalog-explain";

/**
 * Launch Control, read side. Read-only: nothing here writes, and nothing here
 * decides what customers see — counts use the storefront's own filter and
 * category states come from the category directory (lib/launch-control.ts).
 */

export interface LaunchOverview {
  orderingOpen: boolean;
  strict: boolean;
  departments: LaunchDepartment[];
  /** Every brand, with what it holds and what customers can see of it. */
  brands: { slug: string; name: string; isActive: boolean; products: number; visible: number }[];
  totals: {
    categories: number;
    categoriesReachable: number;
    products: number;
    /** Products the storefront lists. */
    visible: number;
    /** Of those, published (the rest are catalogue-only enquiries). */
    visiblePublished: number;
  };
}

/** `client`: a transaction when Launch Control measures a change before applying it. */
export async function getLaunchOverview(client: DbClient = db): Promise<LaunchOverview> {
  const [categories, byStatus, visible, visiblePublished, brands, brandTotals, brandVisible] = await Promise.all([
    client.category.findMany({ orderBy: [{ group: "asc" }, { sortOrder: "asc" }, { name: "asc" }], select: { id: true, slug: true, name: true, group: true, isActive: true } }),
    client.product.groupBy({ by: ["categoryId", "status"], _count: { _all: true } }),
    client.product.groupBy({ by: ["categoryId"], where: catalogListingWhere(), _count: { _all: true } }),
    client.product.count({ where: { AND: [catalogListingWhere(), { status: "published" }] } }),
    client.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, slug: true, name: true, isActive: true } }),
    client.product.groupBy({ by: ["brandId"], _count: { _all: true } }),
    client.product.groupBy({ by: ["brandId"], where: catalogListingWhere(), _count: { _all: true } }),
  ]);
  const brandTotal = new Map(brandTotals.map((b) => [b.brandId, b._count._all]));
  const brandShown = new Map(brandVisible.map((b) => [b.brandId, b._count._all]));
  const visibleBy = new Map(visible.map((v) => [v.categoryId, v._count._all]));
  const rows: LaunchCategoryRow[] = categories.map((c) => {
    const statuses: LaunchCategoryRow["byStatus"] = {};
    for (const s of byStatus) if (s.categoryId === c.id) statuses[s.status] = s._count._all;
    return {
      slug: c.slug, name: c.name, group: String(c.group), isActive: c.isActive,
      visible: visibleBy.get(c.id) ?? 0, byStatus: statuses, hasTaxMapping: Boolean(CATEGORY_TAX_CONFIGS[c.slug]),
      tax: CATEGORY_TAX_CONFIGS[c.slug] ? { hsn: CATEGORY_TAX_CONFIGS[c.slug].hsn, ratePct: CATEGORY_TAX_CONFIGS[c.slug].ratePct } : null,
    };
  });
  const departments = buildLaunchTree(rows);
  const all = departments.flatMap((d) => d.categories).filter((c) => c.state !== "missing");
  return {
    orderingOpen: orderingOpen(),
    strict: strictCatalogue(),
    departments,
    brands: brands.map((b) => ({ slug: b.slug, name: b.name, isActive: b.isActive, products: brandTotal.get(b.id) ?? 0, visible: brandShown.get(b.id) ?? 0 })),
    totals: {
      categories: all.length,
      categoriesReachable: departments.reduce((n, d) => n + d.reachable, 0),
      products: byStatus.reduce((n, s) => n + s._count._all, 0),
      visible: visible.reduce((n, v) => n + v._count._all, 0),
      visiblePublished,
    },
  };
}


export interface LaunchProductRow {
  id: string;
  slug: string;
  title: string;
  brand: { name: string; isActive: boolean };
  status: "draft" | "catalog_only" | "published" | "archived";
  state: CatalogState;
}

export interface LaunchCategoryView {
  slug: string;
  name: string;
  isActive: boolean;
  /** Every product in the category; `products` holds at most LAUNCH_CATEGORY_LIMIT of them. */
  total: number;
  products: LaunchProductRow[];
}

export async function getLaunchCategory(slug: string): Promise<LaunchCategoryView | null> {
  const category = await db.category.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, isActive: true } });
  if (!category) return null;
  const total = await db.product.count({ where: { categoryId: category.id } });
  /* Customer-facing first: published and catalogue-only, then drafts, then
     archived, each by title. Not `orderBy: status` — Postgres sorts an enum in
     declaration order (draft first), so a category with 200 drafts would have
     cut off every product customers can see. */
  const products: Omit<LaunchProductRow, "state">[] = [];
  for (const statuses of LAUNCH_STATUS_ORDER) {
    const room = LAUNCH_CATEGORY_LIMIT - products.length;
    if (room <= 0) break;
    products.push(...await db.product.findMany({
      where: { categoryId: category.id, status: { in: [...statuses] } },
      orderBy: { title: "asc" },
      take: room,
      select: { id: true, slug: true, title: true, status: true, brand: { select: { name: true, isActive: true } } },
    }));
  }
  const states = await explainProducts(products.map((p) => p.id));
  return {
    ...category,
    total,
    products: products.flatMap((p) => {
      const state = states.get(p.id);
      return state ? [{ ...p, state }] : [];
    }),
  };
}

/* ------------------------------------------------------------ switches */

class PlanRollback extends Error {
  constructor(readonly plan: LaunchPlan) {
    super("plan rollback");
  }
}

async function snapshot(tx: DbClient) {
  const [listed, overview] = await Promise.all([
    tx.product.findMany({ where: catalogListingWhere(), select: { id: true } }),
    getLaunchOverview(tx),
  ]);
  return { listed: new Set(listed.map((p) => p.id)), overview };
}

/**
 * What a change would do, without doing it. The switches are applied inside a
 * transaction, everything is measured with the storefront's own queries, and
 * the transaction is rolled back — so the numbers are the real ones, and the
 * database is left exactly as it was.
 */
export async function planLaunchChange(input: LaunchChangeSet, extra: Pick<LaunchPlan, "undoOf" | "conflicts"> = {}): Promise<LaunchPlan> {
  const set = launchChangeSetSchema.parse(input);
  try {
    await db.$transaction(async (tx) => {
      const [cats, brands] = await Promise.all([
        tx.category.findMany({ where: { slug: { in: set.categories.map((r) => r.slug) } }, select: { slug: true, name: true, isActive: true } }),
        tx.brand.findMany({ where: { slug: { in: set.brands.map((r) => r.slug) } }, select: { slug: true, name: true, isActive: true } }),
      ]);
      const row = (kind: LaunchPlanRow["kind"], found: { slug: string; name: string; isActive: boolean }[]) =>
        (r: { slug: string; isActive: boolean }): LaunchPlanRow => {
          const cur = found.find((f) => f.slug === r.slug);
          if (!cur) return { kind, slug: r.slug, name: r.slug, before: null, to: r.isActive, change: "missing" };
          return { kind, slug: r.slug, name: cur.name, before: cur.isActive, to: r.isActive, change: cur.isActive === r.isActive ? "unchanged" : "change" };
        };
      const rows = [...set.categories.map(row("category", cats)), ...set.brands.map(row("brand", brands))];

      const before = await snapshot(tx);
      for (const r of rows.filter((x) => x.change === "change")) {
        if (r.kind === "category") await tx.category.update({ where: { slug: r.slug }, data: { isActive: r.to } });
        else await tx.brand.update({ where: { slug: r.slug }, data: { isActive: r.to } });
      }
      const after = await snapshot(tx);

      const newlyHidden = [...before.listed].filter((id) => !after.listed.has(id));
      const newlyShown = [...after.listed].filter((id) => !before.listed.has(id));
      const cartLinesAffected = newlyHidden.length
        ? await tx.cartItem.count({ where: { variant: { productId: { in: newlyHidden } } } })
        : 0;
      const depts = departmentChanges(before.overview.departments, after.overview.departments);
      throw new PlanRollback({
        rows,
        impact: {
          productsVisibleBefore: before.listed.size,
          productsVisibleAfter: after.listed.size,
          newlyHidden: newlyHidden.length,
          newlyShown: newlyShown.length,
          categoriesReachableBefore: before.overview.totals.categoriesReachable,
          categoriesReachableAfter: after.overview.totals.categoriesReachable,
          departmentsEmptied: depts.emptied,
          departmentsOpened: depts.opened,
          cartLinesAffected,
        },
        confirmText: confirmTextFor(rows),
        ...extra,
      });
    });
  } catch (e) {
    if (e instanceof PlanRollback) return e.plan;
    throw e;
  }
  throw new Error("planLaunchChange: the measuring transaction was not rolled back");
}

export type ApplyLaunchResult =
  | { ok: true; batchId: string | null; changed: number }
  | { ok: false; code: "STALE_PLAN"; stale: { kind: "category" | "brand"; slug: string }[] }
  | { ok: false; code: "MISSING"; missing: { kind: "category" | "brand"; slug: string }[] }
  | { ok: false; code: "CONFIRMATION_REQUIRED"; expected: string }
  | { ok: false; code: "UNDO_MISMATCH"; message: string }
  | { ok: false; code: "VALIDATION"; message: string };

const BATCH_WHERE = { action: "catalogue.launch_batch", entityType: "launch_batch" } as const;

/**
 * Apply a planned change as one batch: all of it or none of it.
 *
 * Rows are locked in a fixed order (categories, then brands, each by slug), so
 * two batches can never deadlock. Every row carries the state the operator saw
 * (`expected`); if any has changed since, nothing is written (STALE_PLAN). Each
 * switch goes through the same writer as a single toggle — same lock, no-op
 * skip and audit — with the batch id in its audit row, and one batch audit
 * row records the whole change for undo.
 */
export async function applyLaunchChange(
  input: LaunchChangeSet,
  confirmText: string | null,
  actor: { id: string | null; email: string },
  undoOf?: string,
): Promise<ApplyLaunchResult> {
  const parsed = launchChangeSetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid change" };
  const set = parsed.data;
  if ([...set.categories, ...set.brands].some((r) => r.expected === undefined)) {
    return { ok: false, code: "VALIDATION", message: "Every change must say what it expects to change from; plan it again" };
  }
  const cats = [...set.categories].sort((a, b) => a.slug.localeCompare(b.slug));
  const brands = [...set.brands].sort((a, b) => a.slug.localeCompare(b.slug));

  return db.$transaction(async (tx): Promise<ApplyLaunchResult> => {
    const lockedCats = cats.length
      ? await tx.$queryRaw<{ id: string; slug: string; isActive: boolean }[]>`
          SELECT id, slug, is_active AS "isActive" FROM categories WHERE slug = ANY(${cats.map((c) => c.slug)}) ORDER BY slug FOR UPDATE`
      : [];
    const lockedBrands = brands.length
      ? await tx.$queryRaw<{ id: string; slug: string; isActive: boolean }[]>`
          SELECT id, slug, is_active AS "isActive" FROM brands WHERE slug = ANY(${brands.map((b) => b.slug)}) ORDER BY slug FOR UPDATE`
      : [];
    const locked = (kind: "category" | "brand", slug: string) => (kind === "category" ? lockedCats : lockedBrands).find((r) => r.slug === slug);
    const current = (kind: "category" | "brand", slug: string) => locked(kind, slug)?.isActive;

    const all = [...cats.map((r) => ({ ...r, kind: "category" as const })), ...brands.map((r) => ({ ...r, kind: "brand" as const }))];
    const missing = all.filter((r) => current(r.kind, r.slug) === undefined).map(({ kind, slug }) => ({ kind, slug }));
    if (missing.length) return { ok: false, code: "MISSING", missing };
    const stale = all.filter((r) => current(r.kind, r.slug) !== r.expected).map(({ kind, slug }) => ({ kind, slug }));
    if (stale.length) return { ok: false, code: "STALE_PLAN", stale };

    const rows = all.map((r) => ({ ...r, id: locked(r.kind, r.slug)!.id, change: (r.expected === r.isActive ? "unchanged" : "change") as LaunchPlanRow["change"], to: r.isActive }));

    /* An undo must be exactly a reversal of the batch it names, and only once —
       otherwise the audit would record a reversal that never happened and the
       history would mark the original batch undone. The rows are already
       locked, so a second, concurrent undo of the same batch waits and then
       fails the stale check above. */
    if (undoOf) {
      const original = await tx.auditLog.findFirst({ where: { ...BATCH_WHERE, entityId: undoOf }, select: { after: true } });
      if (!original) return { ok: false, code: "UNDO_MISMATCH", message: "That batch no longer exists" };
      const already = await tx.auditLog.findFirst({ where: { ...BATCH_WHERE, after: { path: ["undoOf"], equals: undoOf } }, select: { id: true } });
      if (already) return { ok: false, code: "UNDO_MISMATCH", message: "That change has already been undone" };
      const rec = original.after as unknown as BatchRecord;
      const reverses = (r: (typeof rows)[number]) => {
        const b = (r.kind === "category" ? rec.categories : rec.brands).find((x) => x.slug === r.slug);
        return Boolean(b) && b!.to === r.expected && b!.from === r.to && (!b!.id || b!.id === r.id);
      };
      if (rows.some((r) => r.change === "change" && !reverses(r))) {
        return { ok: false, code: "UNDO_MISMATCH", message: "This undo does not match the change it reverses. Review it again." };
      }
    }

    const expectedText = confirmTextFor(rows);
    if (expectedText && confirmText?.trim().toUpperCase() !== expectedText) {
      return { ok: false, code: "CONFIRMATION_REQUIRED", expected: expectedText };
    }
    const changing = rows.filter((r) => r.change === "change");
    if (!changing.length) return { ok: true, batchId: null, changed: 0 };

    const batchId = randomUUID();
    const extra: Record<string, string> = undoOf ? { batchId, undoOf } : { batchId };
    for (const r of changing) {
      const result = r.kind === "category"
        ? await setCategoryActiveTx(tx, r.slug, r.to, actor, extra)
        : await setBrandActiveTx(tx, r.slug, r.to, actor, { ...extra, slug: r.slug });
      if (result !== "changed") throw new Error(`Launch batch: ${r.kind} ${r.slug} did not change (${result})`);
    }
    await recordAudit(tx, {
      actorType: "admin",
      actorId: actor.id,
      action: "catalogue.launch_batch",
      entityType: "launch_batch",
      entityId: batchId,
      after: {
        batchId,
        ...(undoOf ? { undoOf } : {}),
        by: actor.email,
        categories: changing.filter((r) => r.kind === "category").map((r) => ({ id: r.id, slug: r.slug, from: r.expected, to: r.to })),
        brands: changing.filter((r) => r.kind === "brand").map((r) => ({ id: r.id, slug: r.slug, from: r.expected, to: r.to })),
      },
    });
    return { ok: true, batchId, changed: changing.length };
  });
}

/** A batch row's switches. `id` pins the row the batch changed, so a slug reused later is not mistaken for it. */
type BatchSwitch = { id?: string; slug: string; from: boolean; to: boolean };

interface BatchRecord {
  batchId: string;
  undoOf?: string;
  by: string;
  categories: BatchSwitch[];
  brands: BatchSwitch[];
}

/**
 * The plan that reverses a batch. Rows changed again since the batch are left
 * alone and reported as conflicts; the rest go back to what they were. Applied
 * through the same plan → confirm → apply path as any other change.
 */
export async function planLaunchUndo(batchId: string): Promise<{ plan: LaunchPlan | null; conflicts: { kind: "category" | "brand"; slug: string }[] } | null> {
  const row = await db.auditLog.findFirst({ where: { ...BATCH_WHERE, entityId: batchId } });
  if (!row) return null;
  const batch = row.after as unknown as BatchRecord;
  if (await db.auditLog.findFirst({ where: { ...BATCH_WHERE, after: { path: ["undoOf"], equals: batchId } }, select: { id: true } })) {
    return { plan: null, conflicts: [] };
  }
  const [cats, brands] = await Promise.all([
    db.category.findMany({ where: { slug: { in: batch.categories.map((c) => c.slug) } }, select: { id: true, slug: true, isActive: true } }),
    db.brand.findMany({ where: { slug: { in: batch.brands.map((b) => b.slug) } }, select: { id: true, slug: true, isActive: true } }),
  ]);
  /* Anything written to these rows after the batch — another switch, an edit,
     even one that has since been switched back — is someone else's later
     decision, so undo leaves that row alone rather than reverse it. The
     batch's own per-switch audit rows carry its batch id and are skipped. */
  const later = await db.auditLog.findMany({
    where: { entityType: { in: ["category", "brand"] }, entityId: { in: [...cats, ...brands].map((x) => x.id) }, createdAt: { gte: row.createdAt } },
    select: { entityType: true, entityId: true, after: true },
  });
  const touched = new Set(
    later
      .filter((a) => (a.after as { batchId?: unknown } | null)?.batchId !== batchId)
      .map((a) => `${a.entityType}:${a.entityId}`),
  );
  const conflicted = (kind: "category" | "brand", list: { id: string; slug: string; isActive: boolean }[]) => (s: BatchSwitch) => {
    const now = list.find((x) => x.slug === s.slug);
    return !now || (s.id !== undefined && s.id !== now.id) || now.isActive !== s.to || touched.has(`${kind}:${now.id}`);
  };
  const conflicts = [
    ...batch.categories.filter(conflicted("category", cats)).map((c) => ({ kind: "category" as const, slug: c.slug })),
    ...batch.brands.filter(conflicted("brand", brands)).map((b) => ({ kind: "brand" as const, slug: b.slug })),
  ];
  const revert = (list: BatchSwitch[], kind: "category" | "brand") =>
    list.filter((r) => !conflicts.some((c) => c.kind === kind && c.slug === r.slug)).map((r) => ({ slug: r.slug, isActive: r.from, expected: r.to }));
  const inverse = { categories: revert(batch.categories, "category"), brands: revert(batch.brands, "brand") };
  if (!inverse.categories.length && !inverse.brands.length) return { plan: null, conflicts };
  return { plan: await planLaunchChange(inverse, { undoOf: batchId, conflicts }), conflicts };
}

export interface LaunchBatchSummary {
  batchId: string;
  at: string;
  by: string;
  undoOf: string | null;
  undoneBy: string | null;
  categories: { slug: string; from: boolean; to: boolean }[];
  brands: { slug: string; from: boolean; to: boolean }[];
}

/** Recent batches, newest first, each marked if a later batch undid it. */
export async function listLaunchBatches(limit = 10): Promise<LaunchBatchSummary[]> {
  const rows = await db.auditLog.findMany({
    where: BATCH_WHERE,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50) * 2,
  });
  const batches = rows.map((r) => ({ at: r.createdAt.toISOString(), ...(r.after as unknown as BatchRecord) }));
  const undone = new Map(batches.filter((b) => b.undoOf).map((b) => [b.undoOf!, b.batchId]));
  return batches.slice(0, limit).map((b) => ({
    batchId: b.batchId, at: b.at, by: b.by, undoOf: b.undoOf ?? null, undoneBy: undone.get(b.batchId) ?? null,
    categories: b.categories ?? [], brands: b.brands ?? [],
  }));
}
