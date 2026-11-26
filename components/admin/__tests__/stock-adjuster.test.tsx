import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StockAdjusterForm, type AdjustStockAction, type RecountStockAction } from "../stock-adjuster";

afterEach(cleanup);

/**
 * A recount is entered as what was counted; every other reason as a change.
 * The recount sends the on-hand figure the operator was shown, so the server
 * can refuse it if stock moved while they were counting.
 */
function setup(onHand = 40) {
  const adjustCalls: Parameters<AdjustStockAction>[0][] = [];
  const recountCalls: Parameters<RecountStockAction>[0][] = [];
  let saved = 0;
  const adjust: AdjustStockAction = async (i) => (adjustCalls.push(i), { ok: true, data: { qtyAfter: onHand + i.qtyDelta } });
  const recount: RecountStockAction = async (i) => (
    recountCalls.push(i), { ok: true, data: { qtyAfter: i.countedQty, qtyDelta: i.countedQty - onHand } }
  );
  render(
    <StockAdjusterForm variantId="v1" warehouseId="w1" sku="SKU-1" onHand={onHand} adjust={adjust} recount={recount} onSaved={() => saved++} />
  );
  fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
  return { adjustCalls, recountCalls, saved: () => saved };
}

test("a recount asks for the counted quantity and shows the difference it implies", () => {
  setup(40);
  const qty = screen.getByLabelText("Units counted on the shelf for SKU-1");
  fireEvent.change(qty, { target: { value: "37" } });
  assert.ok(screen.getByText("37"));
  assert.ok(screen.getByText("(-3)"));
  fireEvent.change(qty, { target: { value: "40" } });
  assert.ok(screen.getByText("(matches)"), "a matching count is a valid recount");
});

test("a recount sends the count and the on-hand figure that was shown, never a delta", async () => {
  const h = setup(40);
  fireEvent.change(screen.getByLabelText("Units counted on the shelf for SKU-1"), { target: { value: "37" } });
  fireEvent.change(screen.getByLabelText("Note for SKU-1"), { target: { value: "three bags short" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Apply" })));
  assert.deepEqual(h.recountCalls, [{ variantId: "v1", warehouseId: "w1", countedQty: 37, expectedOnHand: 40, note: "three bags short" }]);
  assert.equal(h.adjustCalls.length, 0);
  assert.equal(h.saved(), 1);
});

test("a recount needs a note and cannot be negative", () => {
  setup(40);
  const qty = screen.getByLabelText("Units counted on the shelf for SKU-1");
  const apply = () => screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement;
  fireEvent.change(qty, { target: { value: "37" } });
  assert.equal(apply().disabled, true, "no note yet");
  fireEvent.change(screen.getByLabelText("Note for SKU-1"), { target: { value: "x" } });
  assert.equal(apply().disabled, false);
  fireEvent.change(qty, { target: { value: "-1" } });
  assert.equal(apply().disabled, true, "a shelf cannot hold fewer than zero");
});

test("other reasons still take a change, sent to the adjust action", async () => {
  const h = setup(40);
  fireEvent.change(screen.getByLabelText("Reason for adjusting SKU-1"), { target: { value: "received" } });
  fireEvent.change(screen.getByLabelText("Change in units for SKU-1"), { target: { value: "12" } });
  assert.ok(screen.getByText("52"));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Apply" })));
  assert.deepEqual(h.adjustCalls, [{ variantId: "v1", warehouseId: "w1", qtyDelta: 12, reason: "received", note: undefined }]);
  assert.equal(h.recountCalls.length, 0);
});

test("a refused recount shows the server's message and keeps the form open", async () => {
  const recount: RecountStockAction = async () => ({
    ok: false,
    error: { code: "CONFLICT", message: "Stock changed while you were counting — it now says 35." },
  });
  render(<StockAdjusterForm variantId="v1" warehouseId="w1" sku="SKU-1" onHand={40} adjust={async () => ({ ok: true, data: { qtyAfter: 0 } })} recount={recount} onSaved={() => assert.fail("must not report saved")} />);
  fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
  fireEvent.change(screen.getByLabelText("Units counted on the shelf for SKU-1"), { target: { value: "37" } });
  fireEvent.change(screen.getByLabelText("Note for SKU-1"), { target: { value: "n" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Apply" })));
  assert.match(screen.getByRole("alert").textContent ?? "", /it now says 35/);
  assert.ok(screen.getByRole("button", { name: "Apply" }));
});
