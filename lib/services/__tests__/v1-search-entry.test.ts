import test from "node:test";
import assert from "node:assert/strict";
import { handleListBrands, handleListProducts } from "@/lib/api/v1";
import { db } from "@/lib/db";

const request = (path: string) => new Request(`http://localhost/api/v1/${path}`);

test("search brand shortcuts lead to exactly their advertised catalog", async () => {
  const response = await handleListBrands(request("brands"));
  assert.equal(response.status, 200);
  const { data: brands } = await response.json() as {
    data: { slug: string; name: string; productCount: number }[];
  };
  assert.ok(brands.length > 0);
  assert.ok(brands.length <= 12);
  for (const brand of brands) {
    assert.ok(brand.productCount > 0);
    const destination = await handleListProducts(request(`products?brand=${encodeURIComponent(brand.slug)}`));
    assert.equal(destination.status, 200);
    const { data } = await destination.json() as {
      data: { total: number; items: { id: string }[] };
    };
    assert.equal(data.total, brand.productCount);
    assert.ok(data.items.length > 0);
    const actual = await db.product.count({
      where: { id: { in: data.items.map((p) => p.id) }, brand: { slug: brand.slug } },
    });
    assert.equal(actual, data.items.length, "brand navigation included unrelated products");
  }
});

test("an unknown exact brand filter does not fall back to the whole catalog", async () => {
  const response = await handleListProducts(request("products?brand=no-such-brand-codex-test"));
  const { data } = await response.json() as { data: { total: number; items: unknown[] } };
  assert.equal(data.total, 0);
  assert.deepEqual(data.items, []);
});

/* Neither minPrice/maxPrice nor comma-separated multi-brand were ever wired
 * into this route — the service layer (`listProducts`) supported both, the
 * storefront's own `/search` page used both, but `/api/v1/products` silently
 * dropped them, which is exactly the kind of "API gap" the mobile parity
 * matrix used to describe wholesale as "no sort" before that turned out to be
 * only half true. These two tests are what would have caught the gap. */
test("minPrice/maxPrice on /api/v1/products filter by rupees, converted to paise", async () => {
  const cat = await db.category.create({
    data: { name: "Price Filter Test", slug: `price-filter-test-${Date.now()}`, imageUrl: "/c.webp", seoTitle: "x", seoDescription: "x" },
  });
  const brand = await db.brand.create({ data: { name: "Price Filter Brand", slug: `price-filter-brand-${Date.now()}` } });
  const cheap = await db.product.create({
    data: { title: "Cheap Item", slug: `cheap-item-${Date.now()}`, categoryId: cat.id, brandId: brand.id, status: "published" },
  });
  const pricey = await db.product.create({
    data: { title: "Pricey Item", slug: `pricey-item-${Date.now()}`, categoryId: cat.id, brandId: brand.id, status: "published" },
  });
  const cheapVariant = await db.productVariant.create({
    data: { productId: cheap.id, sku: `SKU-CHEAP-${Date.now()}`, name: "Unit", pricePaise: 10000, isDefault: true },
  });
  const priceyVariant = await db.productVariant.create({
    data: { productId: pricey.id, sku: `SKU-PRICEY-${Date.now()}`, name: "Unit", pricePaise: 90000, isDefault: true },
  });

  try {
    // ₹500–₹800 (50000–80000 paise) should exclude both ₹100 and ₹900 items.
    const noneResponse = await handleListProducts(request(`products?brand=${brand.slug}&minPrice=500&maxPrice=800`));
    const { data: none } = await noneResponse.json() as { data: { total: number } };
    assert.equal(none.total, 0);

    // ₹0–₹500 should include only the ₹100 item.
    const cheapResponse = await handleListProducts(request(`products?brand=${brand.slug}&maxPrice=500`));
    const { data: cheapOnly } = await cheapResponse.json() as { data: { items: { id: string }[] } };
    assert.deepEqual(cheapOnly.items.map((i) => i.id), [cheap.id]);

    // ₹500 and up should include only the ₹900 item.
    const priceyResponse = await handleListProducts(request(`products?brand=${brand.slug}&minPrice=500`));
    const { data: priceyOnly } = await priceyResponse.json() as { data: { items: { id: string }[] } };
    assert.deepEqual(priceyOnly.items.map((i) => i.id), [pricey.id]);
  } finally {
    await db.productVariant.deleteMany({ where: { id: { in: [cheapVariant.id, priceyVariant.id] } } });
    await db.product.deleteMany({ where: { id: { in: [cheap.id, pricey.id] } } });
    await db.brand.delete({ where: { id: brand.id } });
    await db.category.delete({ where: { id: cat.id } });
  }
});

test("comma-separated brand param on /api/v1/products returns the union", async () => {
  const cat = await db.category.create({
    data: { name: "Multi Brand Test", slug: `multi-brand-test-${Date.now()}`, imageUrl: "/c.webp", seoTitle: "x", seoDescription: "x" },
  });
  const brandA = await db.brand.create({ data: { name: "Multi Brand A", slug: `multi-brand-a-${Date.now()}` } });
  const brandB = await db.brand.create({ data: { name: "Multi Brand B", slug: `multi-brand-b-${Date.now()}` } });
  const productA = await db.product.create({
    data: { title: "Product A", slug: `product-a-${Date.now()}`, categoryId: cat.id, brandId: brandA.id, status: "published" },
  });
  const productB = await db.product.create({
    data: { title: "Product B", slug: `product-b-${Date.now()}`, categoryId: cat.id, brandId: brandB.id, status: "published" },
  });
  const variantA = await db.productVariant.create({
    data: { productId: productA.id, sku: `SKU-A-${Date.now()}`, name: "Unit", pricePaise: 10000, isDefault: true },
  });
  const variantB = await db.productVariant.create({
    data: { productId: productB.id, sku: `SKU-B-${Date.now()}`, name: "Unit", pricePaise: 10000, isDefault: true },
  });

  try {
    const response = await handleListProducts(request(`products?brand=${brandA.slug},${brandB.slug}`));
    const { data } = await response.json() as { data: { items: { id: string }[] } };
    const ids = data.items.map((i) => i.id).sort();
    assert.deepEqual(ids, [productA.id, productB.id].sort());
  } finally {
    await db.productVariant.deleteMany({ where: { id: { in: [variantA.id, variantB.id] } } });
    await db.product.deleteMany({ where: { id: { in: [productA.id, productB.id] } } });
    await db.brand.deleteMany({ where: { id: { in: [brandA.id, brandB.id] } } });
    await db.category.delete({ where: { id: cat.id } });
  }
});
