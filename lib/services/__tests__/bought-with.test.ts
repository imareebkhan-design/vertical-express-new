import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { boughtWithProductRaw as boughtWithProduct } from "@/lib/services/catalog";
import { storageGuidanceFor } from "@/lib/storage-guidance";
import { db } from "@/lib/db";

/**
 * "Bought with this" must be evidence, not a shelf.
 *
 * The PDP already had a `related` rail: same category, ordered by `isDeal` and
 * `ratingCount`. The ratings are fabricated (ISS-018), so that ordering is
 * driven by a number nobody measured — which is fine as "more cement" and
 * useless as "what else does this pour need".
 *
 * So this reader only ever answers from real baskets, and the interesting
 * assertions are the negative ones: nothing when there are no orders, nothing
 * from a cancelled order, and never the product itself.
 *
 * Rows are prefixed so the test cleans up after itself; the suite runs against
 * a real database and must leave it as it found it.
 */
const P = "zzz-bw-";

async function cleanup() {
  const orders = await db.order.findMany({
    where: { orderNo: { startsWith: P } },
    select: { id: true },
  });
  await db.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
  await db.user.deleteMany({ where: { email: { startsWith: P } } });
}

/** An order containing exactly these products, in the given status. */
async function placeOrder(
  variantIds: string[],
  status: "delivered" | "cancelled",
  userId: string
) {
  const variants = await db.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, pricePaise: true, name: true, product: { select: { title: true } } },
  });
  return db.order.create({
    data: {
      orderNo: `${P}${randomUUID().slice(0, 8)}`,
      userId,
      address: {},
      status,
      paymentMethod: "dummy",
      subtotalPaise: variants.reduce((s, v) => s + v.pricePaise, 0),
      totalPaise: variants.reduce((s, v) => s + v.pricePaise, 0),
      items: {
        create: variants.map((v) => ({
          variantId: v.id,
          title: v.product.title,
          variantName: v.name,
          unitPricePaise: v.pricePaise,
          qty: 1,
          lineTotalPaise: v.pricePaise,
        })),
      },
    },
  });
}

test("nothing is claimed when nothing has been bought together", async (t) => {
  t.after(cleanup);
  await cleanup();

  const product = await db.product.findFirst({
    where: { status: "published" },
    select: { slug: true },
  });
  assert.ok(product, "no products to test against");

  /* Before any order exists this must be empty rather than falling back to the
     category. A rail headed "bought with this" showing products nobody bought
     together is a claim about other customers' behaviour. */
  const none = await boughtWithProduct(product.slug);
  assert.deepEqual(none, [], "companions were invented with no orders behind them");
});

test("a real basket produces a companion, and never the product itself", async (t) => {
  t.after(cleanup);
  await cleanup();

  const variants = await db.productVariant.findMany({
    take: 2,
    where: { isDefault: true, product: { status: "published" } },
    select: { id: true, product: { select: { id: true, slug: true } } },
  });
  assert.equal(variants.length, 2, "need two published products");
  const [a, b] = variants;

  const user = await db.user.create({
    data: { id: randomUUID(), email: `${P}${randomUUID().slice(0, 8)}@example.invalid` },
  });
  await placeOrder([a.id, b.id], "delivered", user.id);

  const companions = await boughtWithProduct(a.product.slug);
  assert.ok(companions.length > 0, "a real shared basket produced no companion");
  assert.ok(
    companions.some((c) => c.slug === b.product.slug),
    "the product actually bought alongside is missing"
  );
  assert.ok(
    !companions.some((c) => c.slug === a.product.slug),
    "the product recommends itself"
  );
});

test("a cancelled basket is not evidence", async (t) => {
  t.after(cleanup);
  await cleanup();

  const variants = await db.productVariant.findMany({
    take: 2,
    where: { isDefault: true, product: { status: "published" } },
    select: { id: true, product: { select: { slug: true } } },
  });
  const [a, b] = variants;
  const user = await db.user.create({
    data: { id: randomUUID(), email: `${P}${randomUUID().slice(0, 8)}@example.invalid` },
  });
  await placeOrder([a.id, b.id], "cancelled", user.id);

  /* An order that came back is not a statement about what goes together. */
  const companions = await boughtWithProduct(a.product.slug);
  assert.ok(
    !companions.some((c) => c.slug === b.product.slug),
    "a cancelled order is being counted as evidence of what goes together"
  );
});

test("an unknown product asks for nothing", async () => {
  assert.deepEqual(await boughtWithProduct("no-such-product-slug"), []);
});

test("storage guidance is absent by default, never guessed", async () => {
  /* The list is deliberately short. A plausible line invented for a material
     nobody checked is the same failure as an invented delivery time, and it
     sits next to something somebody is about to build with. */
  assert.equal(storageGuidanceFor("lighting"), null);
  assert.equal(storageGuidanceFor("switches-sockets"), null);
  assert.equal(storageGuidanceFor("no-such-category"), null);

  const cement = storageGuidanceFor("cement");
  assert.ok(cement, "cement lost its storage guidance — it is the one that genuinely spoils");
  assert.match(cement.detail, /moisture/i);

  /* Every category we do speak for must say something substantial. A one-word
     title is how a placeholder gets left in. */
  for (const slug of ["cement", "tiling", "waterproofing", "fevicol"]) {
    const g = storageGuidanceFor(slug);
    assert.ok(g && g.title.length > 8 && g.detail.length > 40, `${slug} has a stub`);
  }
});
