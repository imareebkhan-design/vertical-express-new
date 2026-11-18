import test, { afterEach, before, mock } from "node:test";
import assert from "node:assert/strict";
import type { LiveStep } from "@/lib/product-live";

/**
 * The product page's publish panel, its approval and stock panels, and the
 * editor beside them. The rules are the server's; what is tested here is that
 * the screen never carries a stale decision or status into a later click.
 */
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() {}, replace() {}, push() {} }) } });
const saved: unknown[] = [];
mock.module("@/actions/products", {
  namedExports: {
    adminSaveProduct: async (i: unknown) => (saved.push(i), { ok: true, data: null }),
    adminSetVariantPrice: async () => ({ ok: true, data: { changed: false } }),
  },
});

let RTL: typeof import("@testing-library/react");
let Panels: typeof import("../product-live-panel");
let Editor: typeof import("../product-editor");
before(async () => {
  RTL = await import("@testing-library/react");
  Panels = await import("../product-live-panel");
  Editor = await import("../product-editor");
});
afterEach(() => RTL.cleanup());

const ok = <T,>(data: T) => ({ ok: true as const, data });
const step = (key: LiveStep["key"], done: boolean): LiveStep => ({ key, title: key, done, detail: key, href: done ? null : `#${key}`, action: done ? null : "Fix" });
const storefront = { headline: "Customers cannot see this product.", visible: false, lines: [] };

test("Publish stays locked while a step is open, and a refusal is shown in the gate's words", async () => {
  const { render, screen, fireEvent, act } = RTL;
  const calls: unknown[] = [];
  const { rerender } = render(
    <Panels.ProductLivePanel productId="p1" slug="opc" status="draft" steps={[step("photo", false)]} otherReasons={[]} storefront={storefront}
      setStatus={async (i) => (calls.push(i), ok({ changed: true }))} />
  );
  assert.equal((screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement).disabled, true);
  rerender(
    <Panels.ProductLivePanel productId="p1" slug="opc" status="draft" steps={[step("photo", true)]} otherReasons={[]} storefront={storefront}
      setStatus={async (i) => (calls.push(i), { ok: false, error: { code: "VALIDATION", message: "No approved exact product photo as the primary image" } })} />
  );
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish" })));
  assert.deepEqual(calls, [{ productId: "p1", to: "published" }]);
  assert.match(screen.getByRole("alert").textContent ?? "", /Not published\. Still missing: No approved exact product photo/);
});

test("archiving needs a second click", async () => {
  const { render, screen, fireEvent, act } = RTL;
  const calls: unknown[] = [];
  render(<Panels.ProductLivePanel productId="p1" slug="opc" status="published" steps={[]} otherReasons={[]} storefront={storefront}
    setStatus={async (i) => (calls.push(i), ok({ changed: true }))} />);
  fireEvent.click(screen.getByRole("button", { name: "Archive" }));
  assert.deepEqual(calls, []);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Confirm archive" })));
  assert.deepEqual(calls, [{ productId: "p1", to: "archived" }]);
});

test("a decision chosen for one lead photo does not carry over to a new one", () => {
  const { render, screen, fireEvent } = RTL;
  const props = { productId: "p1", title: "OPC 53", approved: false, approvalNote: null, updatedAt: new Date(0).toISOString(), packSensitive: false, record: async () => ok({ public: false }) };
  const { rerender } = render(<Panels.ProductApprovalPanel {...props} photo={{ id: "i1", url: "https://x.test/a.png", sha256: "a".repeat(64) }} />);
  fireEvent.click(screen.getByLabelText(/Exact model confirmed/));
  assert.equal((screen.getByLabelText(/Exact model confirmed/) as HTMLInputElement).checked, true);
  rerender(<Panels.ProductApprovalPanel {...props} photo={{ id: "i2", url: "https://x.test/b.png", sha256: "b".repeat(64) }} />);
  assert.equal((screen.getByLabelText(/Exact model confirmed/) as HTMLInputElement).checked, false, "the old photo's decision is still selected");
});

test("stock records for every pack go in one call", async () => {
  const { render, screen, fireEvent, act } = RTL;
  const calls: unknown[] = [];
  render(<Panels.StockRecordPanel variants={[{ id: "v1", name: "50 kg", sku: "A" }, { id: "v2", name: "25 kg", sku: "B" }]}
    warehouses={[{ id: "w1", name: "Srinagar Central" }]} create={async (i) => (calls.push(i), ok({ created: 2 }))} />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create stock record at zero" })));
  assert.deepEqual(calls, [{ variantIds: ["v1", "v2"], warehouseId: "w1" }]);
});

test("after Publish changes the status, Save in the editor sends the new status and keeps other unsaved edits", async () => {
  const { render, screen, fireEvent, act } = RTL;
  const product = {
    id: "p1", title: "OPC 53", slug: "opc", status: "draft", brandId: "b1", categoryName: "Cement", categoryGroup: "civil",
    categoryIsBulk: true, deliverySpeed: "scheduled", hsn: "2523", gstRatePct: 28, variants: [],
  };
  const brands = [{ id: "b1", name: "BuildPro" }];
  const { rerender } = render(<Editor.ProductEditor product={product} brands={brands} />);
  fireEvent.change(screen.getByDisplayValue("OPC 53"), { target: { value: "OPC 53 Grade" } });
  rerender(<Editor.ProductEditor product={{ ...product, status: "published" }} brands={brands} />);
  saved.length = 0;
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
  assert.equal((saved[0] as { status: string }).status, "published", "a stale draft status would have unpublished it");
  assert.equal((saved[0] as { title: string }).title, "OPC 53 Grade", "an unsaved edit was lost");
});
