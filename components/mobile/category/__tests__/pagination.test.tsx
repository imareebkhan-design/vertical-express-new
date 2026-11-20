import test, { before, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { CatalogQuery, CatalogResult, CatalogItem } from "@/lib/services/catalog";
import type { Category } from "@/prisma/generated/client/client";

let queryString = "brand=alpha";
const requests: { query: CatalogQuery; resolve: (r: CatalogResult) => void; reject: (e: Error) => void }[] = [];
let intersect: () => void = () => {};
mock.module("next/navigation", { namedExports: {
  useSearchParams: () => new URLSearchParams(queryString), useRouter: () => ({ push() {}, refresh() {} }),
} });
mock.module("@/hooks/use-back-or", { namedExports: { useBackOr: () => () => {} } });
mock.module("@/lib/native/haptics", { namedExports: { triggerHaptic() {} } });
mock.module("@/actions/catalog", { namedExports: { fetchProductsAction: (query: CatalogQuery) => new Promise<CatalogResult>((resolve, reject) => requests.push({ query, resolve, reject })) } });
mock.module("@/components/mobile/home/mobile-product-card", { namedExports: { MobileProductCard: ({ product, item }: { product?: CatalogItem; item?: CatalogItem }) => <div>{(product ?? item)?.title}</div> } });
mock.module("@/components/shop/catalog-row", { namedExports: { CatalogRow: ({ item }: { item: CatalogItem }) => <div>{item.title}</div> } });
mock.module("@/components/shop/brand-strip", { namedExports: { BrandStrip: () => null } });
mock.module("@/components/shop/most-ordered", { namedExports: { MostOrdered: () => null } });
mock.module("@/components/mobile/category/mobile-attribute-rail", { namedExports: { MobileAttributeRail: () => null } });
mock.module("@/components/mobile/bottom-sheet-layout", { namedExports: { BottomSheetLayout: () => null } });

let RTL: typeof import("@testing-library/react");
let View: typeof import("../mobile-category-view").MobileCategoryView;
before(async () => {
  globalThis.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) { intersect = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof IntersectionObserver;
  RTL = await import("@testing-library/react");
  ({ MobileCategoryView: View } = await import("../mobile-category-view"));
});
afterEach(() => { RTL.cleanup(); requests.length = 0; queryString = "brand=alpha"; });
const item = (id: string) => ({ id, slug: id, title: id, inStock: false, purchasable: false } as CatalogItem);
const result = (id: string, page = 1): CatalogResult => ({
  items: [item(id)], page, perPage: 1, total: 4,
  facets: { brands: [], attributes: [], priceRange: { minPaise: 0, maxPaise: 0 } },
});
const view = (initialResult: CatalogResult) => <View category={{ name: "Power Tools" } as Category} slug="power-tools" initialResult={initialResult} mostOrdered={[]} brands={[]} />;

test("a late page from the old filter cannot contaminate the replacement listing", async () => {
  const rendered = RTL.render(view(result("old-first")));
  RTL.act(intersect);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].query.brandSlugs, ["alpha"]);
  queryString = "brand=beta";
  rendered.rerender(view(result("new-first")));
  await RTL.act(async () => requests[0].resolve(result("old-late", 2)));
  assert.equal(RTL.screen.queryByText("old-late"), null);
  RTL.act(intersect);
  assert.deepEqual(requests[1].query.brandSlugs, ["beta"]);
  assert.equal(requests[1].query.page, 2);
});
test("a deep-linked later page continues from its actual page and blocks duplicate requests", () => {
  queryString = "brand=alpha,beta&page=2";
  RTL.render(view(result("second", 2)));
  RTL.act(() => { intersect(); intersect(); });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].query.page, 3);
  assert.deepEqual(requests[0].query.brandSlugs, ["alpha", "beta"]);
});
test("failed pagination exposes Retry instead of silently stopping or looping", async () => {
  RTL.render(view(result("first")));
  RTL.act(intersect);
  await RTL.act(async () => requests[0].reject(new Error("offline")));
  RTL.screen.getByRole("alert");
  RTL.act(intersect);
  assert.equal(requests.length, 1);
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Retry" }));
  assert.equal(requests.length, 2);
  assert.equal(requests[1].query.page, 2);
});
