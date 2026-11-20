import test, { afterEach, before, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * The review panel records what the operator was shown, and only after they
 * say what they checked and tick that they did (13 Nov 2026 readiness review).
 */
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() {} }) } });

let RTL: typeof import("@testing-library/react");
let CommercialReviewPanel: typeof import("../commercial-review-panel").CommercialReviewPanel;
before(async () => {
  RTL = await import("@testing-library/react");
  ({ CommercialReviewPanel } = await import("../commercial-review-panel"));
});
afterEach(() => RTL.cleanup());

const offer = {
  unitLabel: "per bag", deliverySpeed: "scheduled", hsn: "2523", gstRatePct: 28,
  variants: [{ sku: "CEM-50", name: "50 kg", isDefault: true, pricePaise: 39800, compareAtPaise: 41000 }],
};
type Call = { productId: string; reason: string; seen: typeof offer };
const settle = () => RTL.act(async () => { await new Promise((r) => setTimeout(r, 20)); });

test("shows the stored offer and tax, and that nothing is on file", () => {
  RTL.render(<CommercialReviewPanel productId="p1" offer={offer} review={null} blockers={["Explicit owner commercial review is missing or incomplete"]} record={async () => ({ ok: true, data: { remaining: [] } })} />);
  const text = document.body.textContent ?? "";
  assert.match(text, /No review on file — this product is not for sale/);
  assert.match(text, /CEM-50/);
  assert.match(text, /398/);
  assert.match(text, /410/);
  assert.match(text, /28%/);
  assert.match(text, /commercial review is missing/);
});

test("the button stays off until a reason is written and the box is ticked; then it sends exactly what was shown", async () => {
  const calls: Call[] = [];
  RTL.render(<CommercialReviewPanel productId="p1" offer={offer} review={null} blockers={[]} record={async (i) => { calls.push(i as Call); return { ok: true, data: { remaining: [] } }; }} />);
  const button = RTL.screen.getByRole("button", { name: "Record review" }) as HTMLButtonElement;
  assert.equal(button.disabled, true);
  RTL.fireEvent.change(RTL.screen.getByRole("textbox"), { target: { value: "Supplier list of 12 Nov" } });
  assert.equal(button.disabled, true, "a reason alone is not enough");
  RTL.fireEvent.click(RTL.screen.getByRole("checkbox"));
  assert.equal(button.disabled, false);
  await RTL.act(async () => { RTL.fireEvent.click(button); });
  await settle();
  assert.deepEqual(calls, [{ productId: "p1", reason: "Supplier list of 12 Nov", seen: offer }]);
  assert.match(RTL.screen.getByRole("status").textContent ?? "", /Nothing else is stopping/);
});

test("a refusal is shown as the server worded it; what still blocks a sale is listed after a success", async () => {
  const { rerender } = RTL.render(<CommercialReviewPanel productId="p1" offer={offer} review={null} blockers={[]} record={async () => ({ ok: false, error: { code: "CONFLICT", message: "This product changed while you were looking at it." } })} />);
  const go = async () => {
    RTL.fireEvent.change(RTL.screen.getByRole("textbox"), { target: { value: "Supplier list of 12 Nov" } });
    if (!(RTL.screen.getByRole("checkbox") as HTMLInputElement).checked) RTL.fireEvent.click(RTL.screen.getByRole("checkbox"));
    await RTL.act(async () => { RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Record review" })); });
    await settle();
  };
  await go();
  assert.match(RTL.screen.getByRole("alert").textContent ?? "", /changed while you were looking/);
  rerender(<CommercialReviewPanel productId="p1" offer={offer} review={null} blockers={[]} record={async () => ({ ok: true, data: { remaining: ["Confirmed identity is required"] } })} />);
  await go();
  assert.match(RTL.screen.getByRole("status").textContent ?? "", /Still not for sale: Confirmed identity is required/);
});
