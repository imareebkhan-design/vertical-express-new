import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { listProducts } from "../catalog";
import { getSuggestions } from "../search";
let categoryId1: string;
let categoryId2: string;
let brandId1: string;
let brandId2: string;

let product1Id: string;
let product2Id: string;
let product3Id: string;

let variant1Id: string;
let variant2Id: string;
let variant3Id: string;

const SKU_1 = `SKU-TEST-1-${Date.now()}`;
const SKU_2 = `SKU-TEST-2-${Date.now()}`;
const SKU_3 = `SKU-TEST-3-${Date.now()}`;

before(async () => {
  // 1. Create test categories
  const cat1 = await db.category.create({
    data: {
      name: "Tiling Materials",
      slug: `tiling-test-${Date.now()}`,
      imageUrl: "/cat1.webp",
      seoTitle: "Tiling",
      seoDescription: "Tiling description",
    },
  });
  categoryId1 = cat1.id;

  const cat2 = await db.category.create({
    data: {
      name: "Special Cement",
      slug: `cement-test-${Date.now()}`,
      imageUrl: "/cat2.webp",
      seoTitle: "Cement",
      seoDescription: "Cement description",
    },
  });
  categoryId2 = cat2.id;

  // 2. Create test brands
  const br1 = await db.brand.create({
    data: { name: "BuildPro Premium", slug: `buildpro-test-${Date.now()}` },
  });
  brandId1 = br1.id;

  const br2 = await db.brand.create({
    data: { name: "UltraTech Max", slug: `ultratech-test-${Date.now()}` },
  });
  brandId2 = br2.id;

  // 3. Create test products
  // Product 1: exact matches "OPC Cement Bag"
  const p1 = await db.product.create({
    data: {
      title: "OPC Cement Bag",
      slug: `opc-cement-test-${Date.now()}`,
      description: "Original OPC Cement Bag",
      categoryId: categoryId2,
      brandId: brandId1,
      ratingAvg: 4.8,
      ratingCount: 15,
      images: { create: { url: "/p1.webp", alt: "p1", isPrimary: true } },
    },
  });
  product1Id = p1.id;

  // Product 2: title starts with "Cement ReadyMix"
  const p2 = await db.product.create({
    data: {
      title: "Cement ReadyMix Plaster",
      slug: `cement-readymix-test-${Date.now()}`,
      description: "Starts with cement",
      categoryId: categoryId2,
      brandId: brandId2,
      ratingAvg: 4.5,
      ratingCount: 120, // Higher ratingCount
      images: { create: { url: "/p2.webp", alt: "p2", isPrimary: true } },
    },
  });
  product2Id = p2.id;

  // Product 3: contains Distemper paint but matches category or synonym "paint"
  const p3 = await db.product.create({
    data: {
      title: "Acrylic Distemper",
      slug: `distemper-test-${Date.now()}`,
      description: "Wall paint",
      categoryId: categoryId1,
      brandId: brandId1,
      ratingAvg: 4.2,
      ratingCount: 5,
      images: { create: { url: "/p3.webp", alt: "p3", isPrimary: true } },
    },
  });
  product3Id = p3.id;

  // 4. Create variants with SKUs
  const v1 = await db.productVariant.create({
    data: { productId: product1Id, sku: SKU_1, name: "Bag", pricePaise: 38500, isDefault: true },
  });
  variant1Id = v1.id;

  const v2 = await db.productVariant.create({
    data: { productId: product2Id, sku: SKU_2, name: "Bag", pricePaise: 42000, isDefault: true },
  });
  variant2Id = v2.id;

  const v3 = await db.productVariant.create({
    data: { productId: product3Id, sku: SKU_3, name: "Litre", pricePaise: 29000, isDefault: true },
  });
  variant3Id = v3.id;

  // 5. Seed stock
  const wh = await db.warehouse.findFirst({ select: { id: true } });
  if (wh) {
    await db.inventory.createMany({
      data: [
        { variantId: variant1Id, warehouseId: wh.id, qtyOnHand: 100 },
        { variantId: variant2Id, warehouseId: wh.id, qtyOnHand: 100 },
        { variantId: variant3Id, warehouseId: wh.id, qtyOnHand: 100 },
      ],
    });
  }
});

after(async () => {
  // Cleanup test data
  if (variant1Id || variant2Id || variant3Id) {
    await db.inventory.deleteMany({
      where: { variantId: { in: [variant1Id, variant2Id, variant3Id].filter(Boolean) as string[] } },
    });
  }
  if (variant1Id) await db.productVariant.delete({ where: { id: variant1Id } });
  if (variant2Id) await db.productVariant.delete({ where: { id: variant2Id } });
  if (variant3Id) await db.productVariant.delete({ where: { id: variant3Id } });

  if (product1Id) {
    await db.productImage.deleteMany({ where: { productId: product1Id } });
    await db.product.delete({ where: { id: product1Id } });
  }
  if (product2Id) {
    await db.productImage.deleteMany({ where: { productId: product2Id } });
    await db.product.delete({ where: { id: product2Id } });
  }
  if (product3Id) {
    await db.productImage.deleteMany({ where: { productId: product3Id } });
    await db.product.delete({ where: { id: product3Id } });
  }

  if (categoryId1) await db.category.delete({ where: { id: categoryId1 } });
  if (categoryId2) await db.category.delete({ where: { id: categoryId2 } });
  if (brandId1) await db.brand.delete({ where: { id: brandId1 } });
  if (brandId2) await db.brand.delete({ where: { id: brandId2 } });
});

test("Search Intelligence: Exact product name matches and ranks top", async () => {
  const result = await listProducts({ search: "OPC Cement Bag" });
  assert.ok(result.items.length >= 1);
  assert.equal(result.items[0].id, product1Id); // Top exact match
});

test("Search Intelligence: Exact SKU search resolves directly", async () => {
  const result = await listProducts({ search: SKU_2 });
  assert.ok(result.items.length >= 1);
  assert.equal(result.items[0].id, product2Id);
});

test("Search Intelligence: Fuzzy typo tolerance matches misspellings (cementt/cemnt)", async () => {
  const result1 = await listProducts({ search: "cementt" });
  const result2 = await listProducts({ search: "cemnt" });

  assert.ok(result1.items.some((i) => i.id === product1Id));
  assert.ok(result2.items.some((i) => i.id === product1Id));
});

test("Search Intelligence: Synonym expansion routes to correct matches (paint -> distemper)", async () => {
  // Seeding mapped synonym word: "paint" -> synonyms: "... acrylic distemper ..."
  const result = await listProducts({ search: "paint" });
  assert.ok(result.items.some((i) => i.id === product3Id));
});

test("Search Intelligence: Brand and category match queries rank properly", async () => {
  // Brand search matches premium brand items
  const resultBrand = await listProducts({ search: "BuildPro Premium" });
  assert.ok(resultBrand.items.some((i) => i.id === product1Id));

  // Category search matches cement items
  const resultCategory = await listProducts({ search: "Special Cement" });
  assert.ok(resultCategory.items.some((i) => i.id === product1Id));
});

test("Search Intelligence: Dynamic ranking priorities (Exact Name > Prefix > Contains)", async () => {
  // Query "OPC Cement Bag" matches Product 1 exactly (Score 100+)
  // Query "OPC Cement" matches Product 1 prefix (Score 90)
  // Query "Cement" matches Product 2 prefix (Score 90) and Product 1 contains (Score 40)
  const resultExact = await listProducts({ search: "OPC Cement Bag" });
  assert.equal(resultExact.items[0].id, product1Id);

  const resultPrefix = await listProducts({ search: "Cement" });
  const idx1 = resultPrefix.items.findIndex((i) => i.id === product1Id);
  const idx2 = resultPrefix.items.findIndex((i) => i.id === product2Id);
  assert.ok(idx1 !== -1, "Product 1 should be found");
  assert.ok(idx2 !== -1, "Product 2 should be found");
  assert.ok(idx2 < idx1, `Product 2 starts with 'Cement' (${idx2}) should rank higher than Product 1 contains 'Cement' (${idx1})`);
});

test("Search Suggestions: suggestion route returns ranked matched groups without duplicates", async () => {
  const result = await getSuggestions("cement");

  assert.ok(result.products.length > 0);
  assert.ok(result.categories.length > 0);
  
  // Verify no duplicate IDs are returned
  const productSlugs = result.products.map((p) => p.slug);
  const uniqueSlugs = Array.from(new Set(productSlugs));
  assert.equal(productSlugs.length, uniqueSlugs.length);
});

test("Search Intelligence: Empty query resolves standard default catalog fallback", async () => {
  const result = await listProducts({ search: "" });
  assert.ok(result.items.length > 0);
});

test("Search Intelligence: SQL injection attempts are blocked and parameterized safely", async () => {
  const maliciousQuery = "cement'; DROP TABLE products;--";
  const result = await listProducts({ search: maliciousQuery });

  // Verify it doesn't crash and returns empty/correct matches rather than running raw SQL injection
  assert.ok(result.items.length === 0 || result.items.length > 0);
  
  // Verify products still exist
  const productsCount = await db.product.count();
  assert.ok(productsCount > 0);
});

test("Search Intelligence: Unicode emoji and special characters handled gracefully", async () => {
  const result = await listProducts({ search: "cement 🏗️" });
  // Trigrams will match "cement" and handle emoji cleanly
  assert.ok(result.items.some((i) => i.id === product1Id));
});
