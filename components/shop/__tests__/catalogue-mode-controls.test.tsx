import test, { afterEach, before, mock } from "node:test";
import assert from "node:assert/strict";
import type { ProductDetail, CatalogItem } from "@/lib/services/catalog";
import type { Product } from "@/lib/data";

/**
 * COMMERCE_MODE=catalogue: purchase controls become enquiry actions.
 *
 * The product page's buy box, the listing card and the dense row are rendered
 * for real under each mode. Only the cart context and the server actions are
 * stand-ins; nothing here may be added to a cart while ordering is closed.
 */

const added: string[] = [];
mock.module("@/hooks/use-cart", {
  namedExports: {
    useCart: () => ({
      addItem: async (variantId: string) => { added.push(variantId); return true; },
      wishlistIds: new Set<string>(),
      setWishlisted() {},
    }),
  },
});
mock.module("@/actions/product-enquiry", {
  namedExports: { submitProductEnquiryAction: async () => ({ ok: true, data: { enquiryNo: "ENQ-20261101-ABCDEF12" } }) },
});
mock.module("@/actions/wishlist", { namedExports: { toggleWishlist: async () => ({ ok: true, data: { added: true } }) } });

let RTL: typeof import("@testing-library/react");
let CommerceModeProvider: typeof import("../commerce-mode-provider").CommerceModeProvider;
let PdpActions: typeof import("../pdp-actions").PdpActions;
let ProductCard: typeof import("@/components/product-card").ProductCard;
let CatalogRow: typeof import("../catalog-row").CatalogRow;
let productAction: typeof import("@/lib/catalog-visibility").productAction;
before(async () => {
  RTL = await import("@testing-library/react");
  ({ CommerceModeProvider } = await import("../commerce-mode-provider"));
  ({ PdpActions } = await import("../pdp-actions"));
  ({ ProductCard } = await import("@/components/product-card"));
  ({ CatalogRow } = await import("../catalog-row"));
  ({ productAction } = await import("@/lib/catalog-visibility"));
});

afterEach(() => { RTL.cleanup(); added.length = 0; });

const detail: ProductDetail = {
  id: "11111111-1111-4111-8111-111111111111", slug: "ultratech-opc-53", title: "UltraTech OPC 53", description: null,
  brandName: "UltraTech", brandSlug: "ultratech", categoryName: "Cement", categorySlug: "cement", categoryIsBulk: true,
  deliverySpeed: null, unitLabel: "per bag", specs: [], ratingAvg: 0, ratingCount: 0, images: [], purchasable: true,
  variants: [{ id: "v-50", name: "50 kg", sku: "UT-50", pricePaise: 38500, compareAtPaise: null, isDefault: true, bulkTiers: [], inStock: true }],
};
const card: Product = { id: "v-50", title: "UltraTech OPC 53", brandLine: "UltraTech", price: 385, compareAt: null, unit: "per bag", inStock: true };
const row: CatalogItem = {
  id: detail.id, slug: detail.slug, title: detail.title, brandName: "UltraTech", categorySlug: "cement", categoryIsBulk: true,
  deliverySpeed: null, imageUrl: null, unitLabel: "per bag", purchasable: true, variantId: "v-50", pricePaise: 38500,
  compareAtPaise: null, hasBulkTiers: false, gradeLabel: null, attributes: {}, ratingAvg: 0, ratingCount: 0, inStock: true,
};

const inMode = (orderingOpen: boolean, ui: React.ReactNode) =>
  RTL.render(<CommerceModeProvider orderingOpen={orderingOpen}>{ui}</CommerceModeProvider>);

test("the rule: bought only when purchasable and ordering is open, otherwise enquired about", () => {
  assert.equal(productAction(true, true), "buy");
  assert.equal(productAction(true, false), "enquire");
  assert.equal(productAction(false, true), "enquire");
  assert.equal(productAction(false, false), "enquire");
});

test("product page, catalogue mode: the price stays, Add to cart becomes the enquiry form", () => {
  inMode(false, <PdpActions product={detail} />);
  assert.equal(RTL.screen.queryAllByRole("button", { name: /add/i }).length, 0, "no cart control");
  assert.equal(RTL.screen.queryAllByLabelText(/quantity/i).length, 0, "no stepper");
  assert.match(RTL.screen.getByText(/385/).textContent ?? "", /₹\s?385/);
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: /Enquire about this product/ }));
  RTL.screen.getByRole("form", { name: "Enquire about UltraTech OPC 53" });
  assert.deepEqual(added, []);
});

test("product page, transactional mode: unchanged — Add to cart, no enquiry", () => {
  inMode(true, <PdpActions product={detail} />);
  assert.ok(RTL.screen.getAllByRole("button", { name: /Add/ }).length >= 1);
  assert.equal(RTL.screen.queryAllByRole("button", { name: /Enquire/ }).length, 0);
});

test("listing card: Add becomes an Enquire link to the product page in catalogue mode only", () => {
  inMode(false, <ProductCard product={card} href="/product/ultratech-opc-53" />);
  const link = RTL.screen.getByRole("link", { name: "Enquire" });
  assert.equal(link.getAttribute("href"), "/product/ultratech-opc-53");
  assert.equal(RTL.screen.queryAllByRole("button", { name: /^Add$|Increase quantity/ }).length, 0);
  RTL.cleanup();

  inMode(true, <ProductCard product={card} href="/product/ultratech-opc-53" />);
  RTL.screen.getByRole("button", { name: "Add" });
  assert.equal(RTL.screen.queryAllByRole("link", { name: "Enquire" }).length, 0);
});

test("dense row: the add button becomes an Enquire link in catalogue mode only", () => {
  inMode(false, <CatalogRow item={row} />);
  assert.equal(RTL.screen.getByRole("link", { name: "Enquire" }).getAttribute("href"), "/product/ultratech-opc-53");
  assert.equal(RTL.screen.queryAllByRole("button", { name: /to cart/ }).length, 0);
  RTL.cleanup();

  inMode(true, <CatalogRow item={row} />);
  RTL.screen.getByRole("button", { name: "Add UltraTech OPC 53 to cart" });
});

test("without the provider a component behaves as before catalogue mode existed", () => {
  RTL.render(<PdpActions product={detail} />);
  assert.ok(RTL.screen.getAllByRole("button", { name: /Add/ }).length >= 1);
});
