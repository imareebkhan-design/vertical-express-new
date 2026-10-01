import test from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { handleGetProduct } from "@/lib/api/v1";
import { storageGuidanceFor } from "@/lib/storage-guidance";

test("product API carries established storage guidance without inventing a shelf life", async () => {
  const product = await db.product.findFirstOrThrow({
    where: { status: "published", category: { slug: "cement" }, variants: { some: { isActive: true } } },
  });
  const response = await handleGetProduct(new Request("http://localhost/api/v1/products/test"), product.slug);
  assert.equal(response.status, 200);
  const { data } = await response.json() as { data: { storageGuidance: unknown } };
  assert.deepEqual(data.storageGuidance, storageGuidanceFor("cement"));
});

test("product API has no storage claim for a category without guidance", async () => {
  const product = await db.product.findFirstOrThrow({
    where: { status: "published", category: { slug: "lighting" }, variants: { some: { isActive: true } } },
  });
  const response = await handleGetProduct(new Request("http://localhost/api/v1/products/test"), product.slug);
  const { data } = await response.json() as { data: { storageGuidance: unknown } };
  assert.equal(data.storageGuidance, null);
});
