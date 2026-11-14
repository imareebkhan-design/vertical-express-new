import test, { before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/prisma/generated/client/client";

let authorized = true;
let failure: Error | undefined;
let writes = 0;
const paths: string[] = [];
mock.module("next/cache", { namedExports: { revalidatePath: (path: string) => paths.push(path) } });
mock.module("@/lib/services/admin/authz", { namedExports: { getAdminUser: async () => authorized ? { id: "actor", email: "test@example.invalid" } : null } });
mock.module("@/lib/observability", { namedExports: { log() {} } });
mock.module("@/lib/services/audit", { namedExports: { recordAudit() {} } });
const write = async () => { writes++; if (failure) throw failure; return { name: "Before", slug: "before" }; };
mock.module("@/lib/db", { namedExports: { db: { $transaction: write } } });
mock.module("@/lib/services/admin/brand-writes", { namedExports: {
  editBrand: write,
  setBrandActive: async () => { writes++; return "unchanged"; },
  assignProductBrand: async () => { writes++; return { ok: true, changed: false }; },
} });
let actions: typeof import("@/actions/brands");
before(async () => { actions = await import("@/actions/brands"); });
beforeEach(() => { authorized = true; failure = undefined; writes = 0; paths.length = 0; });

test("brand active action rejects non-boolean runtime input without writing", async () => {
  for (const input of [undefined, null, "false", 0, {}]) {
    const result = await actions.adminSetBrandActive("test", input as boolean);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "VALIDATION");
  }
  assert.equal(writes, 0);
});

test("brand actions reject a non-admin before validating or mutating", async () => {
  authorized = false;
  const results = await Promise.all([
    actions.adminSaveBrand(null), actions.adminSetBrandActive("test", undefined as unknown as boolean),
    actions.adminAssignProductBrand(null),
  ]);
  for (const result of results) {
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
  }
  assert.equal(writes, 0);
});

for (const originalSlug of [undefined, "before"]) {
  test(`brand ${originalSlug ? "edit" : "create"} distinguishes conflicts from audit/database failures`, async () => {
    const input = { name: "After", slug: "after", isActive: true, originalSlug };
    failure = new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test", meta: { modelName: "Brand", target: ["slug"] } });
    const conflict = await actions.adminSaveBrand(input);
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.error.code, "CONFLICT");
    for (const error of [new Error("audit unavailable"), new Prisma.PrismaClientKnownRequestError("audit conflict", { code: "P2002", clientVersion: "test", meta: { modelName: "AuditLog", target: ["id"] } })]) {
      failure = error;
      await assert.rejects(actions.adminSaveBrand(input), (received) => received === error);
    }
  });
}

test("unchanged brand retries still invalidate console and storefront caches", async () => {
  assert.equal((await actions.adminSetBrandActive("test", false)).ok, true);
  assert.deepEqual(paths, ["/admin/brands", "/"]);
  paths.length = 0;
  assert.equal((await actions.adminAssignProductBrand({ productId: "1d4c4a12-e858-4f82-bc49-fb67cd346701", brandId: "2d4c4a12-e858-4f82-bc49-fb67cd346701" })).ok, true);
  assert.deepEqual(paths, ["/admin/products", "/"]);
});
