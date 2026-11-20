import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/prisma/generated/client/client";
import { editBrand, setBrandActive, assignProductBrand } from "@/lib/services/admin/brand-writes";
import { setVariantActive, setDefaultVariant } from "@/lib/services/admin/product-details";

async function fixture(t: TestContext) {
  const actor = { id: randomUUID(), email: "brand-audit@example.invalid" };
  const tag = randomUUID();
  const brands = await Promise.all(["a", "b", "c"].map((suffix) => db.brand.create({
    data: { slug: `audit-${tag}-${suffix}`, name: `Audit ${tag} ${suffix}` },
  })));
  const category = await db.category.findFirstOrThrow({ select: { id: true } });
  const product = await db.product.create({ data: {
    slug: `audit-${tag}`, title: "Audit fixture", categoryId: category.id, brandId: brands[0].id,
  } });
  t.after(async () => {
    await db.auditLog.deleteMany({ where: { actorId: actor.id } });
    await db.productVariant.deleteMany({ where: { productId: product.id } });
    await db.product.delete({ where: { id: product.id } });
    await db.brand.deleteMany({ where: { id: { in: brands.map((b) => b.id) } } });
  });
  return { actor, brands, product };
}

/** Commit another writer only after the real service is observed waiting on its
 * row lock. This forces the stale-read interleaving rather than racing timers. */
async function behindWriter<T>(write: (tx: Prisma.TransactionClient) => Promise<unknown>, action: () => Promise<T>) {
  let release!: () => void;
  let ready!: (pid: number) => void;
  let rejectReady!: (error: unknown) => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const locked = new Promise<number>((resolve, reject) => { ready = resolve; rejectReady = reject; });
  const writer = db.$transaction(async (tx) => {
    await write(tx);
    const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    ready(pid);
    await gate;
  }, { timeout: 15_000 });
  void writer.catch(rejectReady);
  const holder = await locked;
  let finished = false;
  const work = action().then(
    (value) => { finished = true; return { value }; },
    (error: unknown) => { finished = true; return { error }; },
  );
  try {
    const deadline = Date.now() + 3_000;
    for (;;) {
      const [waiting] = await db.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM pg_stat_activity
        WHERE datname = current_database() AND ${holder} = ANY(pg_blocking_pids(pid))`;
      if (Number(waiting.count) > 0) break;
      assert.equal(finished, false, "the service decided from stale state without waiting for the writer");
      assert.ok(Date.now() < deadline, "service did not queue behind the competing writer");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    release();
    await writer;
  }
  const result = await work;
  if ("error" in result) throw result.error;
  return result.value;
}

test("brand edit audits the name committed by a competing writer", async (t) => {
  const { actor, brands: [brand] } = await fixture(t);
  const intermediate = `${brand.name} first`;
  const final = { name: `${brand.name} last`, slug: brand.slug, isActive: true };
  await behindWriter(
    (tx) => tx.brand.update({ where: { id: brand.id }, data: { name: intermediate } }),
    () => editBrand(brand.slug, final, actor),
  );
  const audit = await db.auditLog.findFirstOrThrow({ where: { actorId: actor.id } });
  assert.deepEqual(audit.before, { name: intermediate, slug: brand.slug, isActive: true });
  assert.deepEqual(audit.after, final);
  assert.equal((await db.brand.findUniqueOrThrow({ where: { id: brand.id } })).name, final.name);
});

test("restore waits for a competing retirement instead of returning a stale no-op", async (t) => {
  const { actor, brands: [brand] } = await fixture(t);
  const result = await behindWriter(
    (tx) => tx.brand.update({ where: { id: brand.id }, data: { isActive: false } }),
    () => setBrandActive(brand.slug, true, actor),
  );
  assert.equal(result, "changed");
  const audit = await db.auditLog.findFirstOrThrow({ where: { actorId: actor.id } });
  assert.equal(audit.action, "brand.restored");
  assert.deepEqual(audit.before, { isActive: false });
  assert.deepEqual(audit.after, { isActive: true });
  assert.equal((await db.brand.findUniqueOrThrow({ where: { id: brand.id } })).isActive, true);
});

test("a duplicate retirement after a competing retirement does not invent an audit transition", async (t) => {
  const { actor, brands: [brand] } = await fixture(t);
  const result = await behindWriter(
    (tx) => tx.brand.update({ where: { id: brand.id }, data: { isActive: false } }),
    () => setBrandActive(brand.slug, false, actor),
  );
  assert.equal(result, "unchanged");
  assert.equal(await db.auditLog.count({ where: { actorId: actor.id } }), 0);
});

test("brand reassignment audits the competing assignment as its preimage", async (t) => {
  const { actor, brands: [, middle, last], product } = await fixture(t);
  await behindWriter(
    (tx) => tx.product.update({ where: { id: product.id }, data: { brandId: middle.id } }),
    () => assignProductBrand(product.id, last.id, actor),
  );
  const audit = await db.auditLog.findFirstOrThrow({ where: { actorId: actor.id } });
  assert.deepEqual(audit.before, { brandId: middle.id });
  assert.deepEqual(audit.after, { brandId: last.id, brandName: last.name });
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).brandId, last.id);
});

test("assignment to the original brand waits rather than returning a stale no-op", async (t) => {
  const { actor, brands: [first, middle], product } = await fixture(t);
  await behindWriter(
    (tx) => tx.product.update({ where: { id: product.id }, data: { brandId: middle.id } }),
    () => assignProductBrand(product.id, first.id, actor),
  );
  const audit = await db.auditLog.findFirstOrThrow({ where: { actorId: actor.id } });
  assert.deepEqual(audit.before, { brandId: middle.id });
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).brandId, first.id);
});

test("a conflicting edit rolls back without an audit row", async (t) => {
  const { actor, brands: [first, other] } = await fixture(t);
  await assert.rejects(editBrand(first.slug, { name: other.name, slug: first.slug, isActive: false }, actor));
  assert.equal(await db.auditLog.count({ where: { actorId: actor.id } }), 0);
  const unchanged = await db.brand.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(unchanged.name, first.name);
  assert.equal(unchanged.isActive, true);
});

for (const operation of ["edit", "retire", "assign"] as const) {
  test(`${operation} rolls back when the audit insertion fails`, async (t) => {
    const { brands: [first, other], product } = await fixture(t);
    // Invalid UUID is rejected by PostgreSQL at audit insertion, after the mutation.
    const actor = { id: "invalid-audit-actor", email: "audit@example.invalid" };
    const count = await db.auditLog.count({ where: { entityId: { in: [first.id, product.id] } } });
    await assert.rejects(operation === "edit"
      ? editBrand(first.slug, { name: `${first.name} changed`, slug: first.slug, isActive: false }, actor)
      : operation === "retire" ? setBrandActive(first.slug, false, actor)
      : assignProductBrand(product.id, other.id, actor));
    const brand = await db.brand.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(brand.name, first.name);
    assert.equal(brand.isActive, true);
    assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).brandId, first.id);
    assert.equal(await db.auditLog.count({ where: { entityId: { in: [first.id, product.id] } } }), count);
  });
}

for (const scenario of ["duplicate retirement", "became default", "retired before default selection"] as const) {
  test(`variant guard rechecks after locking: ${scenario}`, async (t) => {
    const { actor, product } = await fixture(t);
    const variant = await db.productVariant.create({ data: {
      productId: product.id, name: "Test variant", sku: randomUUID(), pricePaise: 100, isDefault: false,
    } });
    const result = await behindWriter(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${product.id}::uuid FOR UPDATE`;
      await tx.productVariant.update({ where: { id: variant.id }, data:
        scenario === "became default" ? { isDefault: true } : { isActive: false } });
    }, () => scenario === "retired before default selection"
      ? setDefaultVariant(variant.id, actor) : setVariantActive(variant.id, false, actor));
    assert.deepEqual(result, scenario === "duplicate retirement" ? { ok: true, variantId: variant.id }
      : { ok: false, code: scenario === "became default" ? "IS_DEFAULT" : "INACTIVE" });
    assert.equal(await db.auditLog.count({ where: { actorId: actor.id } }), 0);
  });
}
