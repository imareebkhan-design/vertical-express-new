import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Anonymous browse journey: Home → Categories → a stocked category → product.
 * Phase 1 roadmap P1.6 (docs/phase1/05-ROADMAP.md). Read-only: see playwright.config.ts.
 *
 * Nothing here asserts a price, a stock figure or a delivery time. Those values are
 * the owner's, and the shop may be in catalogue mode, where none is shown.
 */

type Category = { slug: string; productCount: number; discovery: string };
type Product = { slug: string; purchasable: boolean; pricePaise: number | null };

async function categories(request: APIRequestContext): Promise<Category[]> {
  const res = await request.get("/api/v1/categories");
  expect(res.status()).toBe(200);
  return (await res.json()).data as Category[];
}

async function firstProduct(request: APIRequestContext, category: string): Promise<Product> {
  const res = await request.get(`/api/v1/products?category=${category}&perPage=1`);
  expect(res.status()).toBe(200);
  const items = (await res.json()).data.items as Product[];
  expect(items.length).toBeGreaterThan(0);
  return items[0];
}

test("health and the public API answer", async ({ request }) => {
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await categories(request)).length).toBeGreaterThan(0);
});

test("home renders and links into the catalogue", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator('a[href^="/category/"]').first()).toBeAttached();
});

test("every category the directory lists opens (no 404 from live navigation)", async ({ page, request }) => {
  const res = await page.goto("/categories");
  expect(res?.status()).toBe(200);
  const hrefs = await page.$$eval('a[href^="/category/"]', (as) => [...new Set(as.map((a) => a.getAttribute("href") as string))]);
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const r = await request.get(href);
    expect(r.status(), href).toBe(200);
  }
});

test("a stocked category lists products that open", async ({ page, request }) => {
  const stocked = (await categories(request)).find((c) => c.productCount > 0);
  test.skip(!stocked, "no category holds a visible product on this backend");
  await page.goto(`/category/${stocked!.slug}`);
  const product = page.locator('a[href^="/product/"]').first();
  await expect(product).toBeVisible();
  const href = (await product.getAttribute("href")) as string;
  await page.goto(href);
  await expect(page.locator("h1").first()).toBeVisible();
});

test("a product page offers a next step that matches the trading mode", async ({ page, request }) => {
  const stocked = (await categories(request)).find((c) => c.productCount > 0);
  test.skip(!stocked, "no category holds a visible product on this backend");
  const p = await firstProduct(request, stocked!.slug);
  await page.goto(`/product/${p.slug}`);
  if (p.purchasable) {
    await expect(page.getByRole("button", { name: /add to cart/i }).first()).toBeVisible();
  } else {
    /* Catalogue mode, or a catalogue-only product: no price, and a working enquiry. */
    await expect(page.getByText(/price on request/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /enquire/i }).first()).toBeVisible();
  }
});

test("an unknown product is a 404, not an error page", async ({ request }) => {
  expect((await request.get("/product/e2e-no-such-product")).status()).toBe(404);
});

test("search renders", async ({ page }) => {
  const res = await page.goto("/search?q=drill");
  expect(res?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
});
