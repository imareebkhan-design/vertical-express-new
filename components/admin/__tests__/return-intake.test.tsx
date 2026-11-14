import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReturnIntakeView, type CreateReturn } from "@/components/admin/returns/return-intake-view";

afterEach(cleanup);
const lines = [
  { orderItemId: "11111111-1111-4111-8111-111111111111", title: "PPC cement", variantName: "50 kg", delivered: 10, requested: 2, returnable: 8 },
  { orderItemId: "22222222-2222-4222-8222-222222222222", title: "Tile adhesive", variantName: "20 kg", delivered: 0, requested: 0, returnable: 0 },
];

test("only returnable lines are offered; the record-only warning is shown; the request is sent as entered", async () => {
  const calls: unknown[] = [];
  const create: CreateReturn = async (i) => { calls.push(i); return { ok: true, data: { returnNo: "RET-VE-1-1" } }; };
  render(<ReturnIntakeView orderNo="VE-1" lines={lines} create={create} onDone={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Record a return request" }));
  assert.ok(screen.getByText(/nothing is refunded, restocked or exchanged/));
  assert.equal(screen.queryByLabelText(/Tile adhesive/), null, "an undelivered line is not offered");
  fireEvent.change(screen.getByLabelText("Quantity to return: PPC cement"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("What the customer said"), { target: { value: "Three bags split" } });
  fireEvent.change(screen.getByLabelText("Asked at"), { target: { value: "2026-10-15T14:35" } });
  fireEvent.submit(screen.getByRole("form", { name: "Record a return request" }));
  await waitFor(() => screen.getByRole("status"));
  assert.deepEqual(calls, [{
    orderNo: "VE-1", items: [{ orderItemId: lines[0].orderItemId, qty: 3 }], reason: "damaged_in_transit",
    explanation: "Three bags split", requestedAtIst: "2026-10-15T14:35", channel: "Phone call",
  }]);
  assert.match(screen.getByRole("status").textContent ?? "", /Nothing has been refunded or restocked/);
});

test("nothing returnable: says so, no form", () => {
  render(<ReturnIntakeView orderNo="VE-1" lines={[lines[1]]} create={async () => ({ ok: true, data: { returnNo: "x" } })} onDone={() => {}} />);
  assert.ok(screen.getByText(/Nothing on this order can be returned/));
  assert.equal(screen.queryByRole("button", { name: "Record a return request" }), null);
});
