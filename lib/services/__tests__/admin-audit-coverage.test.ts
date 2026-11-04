import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "@/lib/db";
import { adjustStock, recountStock } from "@/lib/services/inventory-movements";

/**
 * ISS-015 / T20: every money, stock, price and approval change made from the
 * console leaves an `AuditLog` row naming the operator account, with the value
 * before and after, written in the same transaction as the change.
 *
 * Two halves. The database tests prove the rows for the stock paths, which used
 * to leave only a `StockMovement` keyed by email. The sweep proves that every
 * mutating `admin*` server action reaches `recordAudit`, directly or through
 * the service module it calls, so a new action cannot ship without one.
 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ACTOR_EMAIL = "zzz-audit-test@example.invalid";

async function pick() {
  const inv = await db.inventory.findFirst({
    where: { qtyOnHand: { gte: 5 } },
    select: { variantId: true, warehouseId: true, qtyOnHand: true },
  });
  assert.ok(inv, "no stocked inventory row to test against");
  return inv;
}

async function restore(inv: { variantId: string; warehouseId: string; qtyOnHand: number }) {
  await db.stockMovement.deleteMany({ where: { actorEmail: ACTOR_EMAIL, variantId: inv.variantId } });
  await db.inventory.update({
    where: { variantId_warehouseId: { variantId: inv.variantId, warehouseId: inv.warehouseId } },
    data: { qtyOnHand: inv.qtyOnHand },
  });
}

test("a stock adjustment writes an audit row with the operator and the before/after count", async (t) => {
  const inv = await pick();
  const actorId = randomUUID();
  t.after(() => restore(inv));

  const r = await adjustStock({
    variantId: inv.variantId,
    warehouseId: inv.warehouseId,
    qtyDelta: -2,
    reason: "damaged",
    note: "two torn bags",
    actorEmail: ACTOR_EMAIL,
    actorId,
  });
  assert.ok(r.ok);

  const rows = await db.auditLog.findMany({ where: { actorId, action: "inventory.adjusted" } });
  assert.equal(rows.length, 1, "exactly one audit row per adjustment");
  const [row] = rows;
  assert.equal(row.actorType, "admin");
  assert.equal(row.entityType, "inventory");
  assert.equal(row.entityId, `${inv.variantId}:${inv.warehouseId}`);
  assert.deepEqual(row.before, { qtyOnHand: inv.qtyOnHand });
  assert.deepEqual(row.after, {
    qtyOnHand: inv.qtyOnHand - 2,
    qtyDelta: -2,
    reason: "damaged",
    note: "two torn bags",
    actorEmail: ACTOR_EMAIL,
  });
});

test("a refused adjustment writes no audit row", async (t) => {
  const inv = await pick();
  const actorId = randomUUID();
  t.after(() => restore(inv));

  const r = await adjustStock({
    variantId: inv.variantId,
    warehouseId: inv.warehouseId,
    qtyDelta: -(inv.qtyOnHand + 1),
    reason: "damaged",
    actorEmail: ACTOR_EMAIL,
    actorId,
  });
  assert.equal(r.ok, false);
  assert.equal(await db.auditLog.count({ where: { actorId } }), 0, "an audit row described a change that did not happen");
});

test("a recount writes an audit row with the operator and the before/after count", async (t) => {
  const inv = await pick();
  const actorId = randomUUID();
  t.after(() => restore(inv));

  const r = await recountStock({
    variantId: inv.variantId,
    warehouseId: inv.warehouseId,
    countedQty: inv.qtyOnHand + 3,
    expectedOnHand: inv.qtyOnHand,
    note: "found a pallet behind the racking",
    actorEmail: ACTOR_EMAIL,
    actorId,
  });
  assert.ok(r.ok);

  const row = await db.auditLog.findFirstOrThrow({ where: { actorId, action: "inventory.recounted" } });
  assert.equal(row.actorType, "admin");
  assert.deepEqual(row.before, { qtyOnHand: inv.qtyOnHand });
  assert.deepEqual(row.after, {
    qtyOnHand: inv.qtyOnHand + 3,
    qtyDelta: 3,
    note: "found a pallet behind the racking",
    actorEmail: ACTOR_EMAIL,
  });
});

test("a stale recount writes no audit row", async (t) => {
  const inv = await pick();
  const actorId = randomUUID();
  t.after(() => restore(inv));

  const r = await recountStock({
    variantId: inv.variantId,
    warehouseId: inv.warehouseId,
    countedQty: 1,
    expectedOnHand: inv.qtyOnHand + 99,
    note: "stale",
    actorEmail: ACTOR_EMAIL,
    actorId,
  });
  assert.equal(r.ok, false);
  assert.equal(await db.auditLog.count({ where: { actorId } }), 0);
});

/* Actions that only read: previews, exports and a gateway status check that
   writes through its service when something changed. */
const READ_ONLY = new Set(["adminPreviewCatalogue", "adminPreviewCatalogueUpdate", "adminExportCatalogueUpdate"]);

function moduleFile(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = join(ROOT, spec.slice(2));
  for (const c of [`${base}.ts`, join(base, "index.ts")]) {
    try {
      return readFileSync(c, "utf8") && c;
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

/**
 * A service module reaches the audit log if it writes a row itself, or calls a
 * function from another service module that does (for example the catalogue
 * import, which writes each product through `writeProduct`). Bounded depth.
 */
function reachesAudit(file: string, depth: number): boolean {
  const src = readFileSync(file, "utf8");
  /* Imported and used: called directly, or passed on as an injectable writer
     (`audit: Audit = recordAudit` in variant pricing). */
  if ((src.match(/\brecordAudit\b/g) ?? []).length >= 2) return true;
  if (depth === 0) return false;
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"(@\/lib\/services\/[^"]+)"/g)) {
    const ids = m[1].split(",").map((s) => s.replace(/\btype\b/, "").split(" as ").pop()?.trim()).filter(Boolean);
    if (!ids.some((id) => new RegExp(`\\b${id}\\(`).test(src))) continue;
    const next = moduleFile(m[2]);
    if (next && reachesAudit(next, depth - 1)) return true;
  }
  return false;
}

test("every mutating admin server action reaches recordAudit", () => {
  const dir = join(ROOT, "actions");
  let checked = 0;
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(dir, name), "utf8");
    const imports = new Map<string, string>();
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"(@\/[^"]+)"/g)) {
      for (const raw of m[1].split(",")) {
        const id = raw.replace(/\btype\b/, "").split(" as ").pop()?.trim();
        if (id) imports.set(id, m[2]);
      }
    }
    const fns = [...src.matchAll(/export async function (admin\w*)\(/g)];
    fns.forEach((m, i) => {
      const fn = m[1];
      if (READ_ONLY.has(fn)) return;
      const body = src.slice(m.index ?? 0, fns[i + 1]?.index ?? src.length);
      const direct = /recordAudit\(/.test(body);
      const viaService = [...imports].some(([id, spec]) => {
        if (!spec.includes("/services/") || !new RegExp(`\\b${id}\\(`).test(body)) return false;
        const file = moduleFile(spec);
        return file !== null && reachesAudit(file, 3);
      });
      assert.ok(direct || viaService, `actions/${name}: ${fn} changes data but writes no audit row`);
      checked++;
    });
  }
  assert.ok(checked >= 40, `only ${checked} admin actions checked`);
});
