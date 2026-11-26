import test, { mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Launch Control actions, at runtime (the static admin-authorization test only
 * checks their shape): a non-admin is refused before any service runs, an
 * admin's identity is what reaches the audit, and the service's refusals reach
 * the operator as the right codes.
 */

let admin: { id: string; email: string } | null = null;
const calls: string[] = [];
let applyResult: unknown = { ok: true, batchId: "b1", changed: 1 };
let applyActor: unknown = null;

mock.module("@/lib/services/admin/authz", { namedExports: { getAdminUser: async () => admin } });
mock.module("next/cache", { namedExports: { revalidatePath: () => { calls.push("revalidate"); } } });
mock.module("@/lib/services/admin/launch-control", {
  namedExports: {
    planLaunchChange: async () => { calls.push("plan"); return { rows: [], impact: {}, confirmText: null }; },
    planLaunchUndo: async () => { calls.push("undo"); return { plan: null, conflicts: [] }; },
    applyLaunchChange: async (_set: unknown, _confirm: unknown, actor: unknown) => { calls.push("apply"); applyActor = actor; return applyResult; },
  },
});

const load = () => import("@/actions/launch-control");
const change = { categories: [{ slug: "tiling", isActive: false, expected: true }] };

test("a non-admin is refused by every action before any service runs", async () => {
  admin = null;
  calls.length = 0;
  const a = await load();
  for (const r of [
    await a.adminPlanLaunchChange(change),
    await a.adminApplyLaunchChange({ changeSet: change, confirmText: null }),
    await a.adminPlanLaunchUndo("00000000-0000-4000-8000-000000000000"),
  ]) {
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "FORBIDDEN");
  }
  assert.deepEqual(calls, [], "no plan, apply, undo or revalidation for a non-admin");
});

test("an admin's apply carries the admin as the actor and revalidates the shop", async () => {
  admin = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.test" };
  calls.length = 0;
  applyResult = { ok: true, batchId: "b1", changed: 1 };
  const r = await (await load()).adminApplyLaunchChange({ changeSet: change, confirmText: null });
  assert.deepEqual(r, { ok: true, data: { batchId: "b1", changed: 1 } });
  assert.deepEqual(applyActor, admin);
  assert.ok(calls.includes("revalidate"));
});

test("refusals reach the operator as conflict / confirmation, and nothing is revalidated", async () => {
  admin = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.test" };
  const a = await load();
  calls.length = 0;
  applyResult = { ok: false, code: "STALE_PLAN", stale: [{ kind: "category", slug: "tiling" }] };
  const stale = await a.adminApplyLaunchChange({ changeSet: change, confirmText: null });
  assert.equal(!stale.ok && stale.error.code, "CONFLICT");
  applyResult = { ok: false, code: "CONFIRMATION_REQUIRED", expected: "HIDE 2" };
  const typed = await a.adminApplyLaunchChange({ changeSet: change, confirmText: "x" });
  assert.equal(!typed.ok && typed.error.field, "confirm");
  assert.match(!typed.ok ? typed.error.message : "", /HIDE 2/);
  assert.ok(!calls.includes("revalidate"));
});

test("malformed input is refused before the service", async () => {
  admin = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.test" };
  calls.length = 0;
  const a = await load();
  const r = await a.adminPlanLaunchChange({ categories: [{ slug: "DROP TABLE", isActive: false }] });
  assert.equal(!r.ok && r.error.code, "VALIDATION");
  const u = await a.adminPlanLaunchUndo("not-a-batch");
  assert.equal(!u.ok && u.error.code, "VALIDATION");
  assert.deepEqual(calls, []);
});
