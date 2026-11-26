import test, { afterEach, before, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Dispatch board, 13 Nov 2026 readiness review:
 *   - "Cancel" restocks and cannot be undone, yet one click did it, in any
 *     state — including on the road, where the goods are not on the shelf;
 *   - a failed delivery had no control at all (the service had only a script).
 */
const calls: { fn: string; input: unknown }[] = [];
const ok = { ok: true, data: { deliveryCode: null } };
mock.module("@/actions/dispatch", {
  namedExports: {
    adminAdvanceShipment: async (input: unknown) => { calls.push({ fn: "advance", input }); return ok; },
    adminAssignShipment: async () => ok,
    adminConfirmDelivery: async () => ok,
    adminDeliverWithoutCode: async () => ok,
    adminReceiveShipmentBack: async (input: unknown) => { calls.push({ fn: "receivedBack", input }); return { ok: true, data: { orderStatus: "packed" } }; },
  },
});
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() {} }) } });

let RTL: typeof import("@testing-library/react");
let DispatchControls: typeof import("../dispatch-controls").DispatchControls;
before(async () => {
  RTL = await import("@testing-library/react");
  ({ DispatchControls } = await import("../dispatch-controls"));
});
afterEach(() => { RTL.cleanup(); calls.length = 0; });

type Props = Parameters<typeof DispatchControls>[0];
const roster = { drivers: [], vehicles: [] } as unknown as Props["roster"];
const shipment = (status: string) => ({ id: "s1", ref: "VE-1-1", status, driver: null, vehicle: null }) as unknown as Props["shipment"];
const click = async (name: RegExp) => {
  await RTL.act(async () => { RTL.fireEvent.click(RTL.screen.getByRole("button", { name })); });
  await RTL.act(async () => { await new Promise((r) => setTimeout(r, 20)); });
};

test("Cancel asks first; declining changes nothing", async () => {
  const asked: string[] = [];
  window.confirm = (m?: string) => { asked.push(m ?? ""); return false; };
  RTL.render(<DispatchControls shipment={shipment("packed")} roster={roster} />);
  await click(/^Cancel$/);
  assert.equal(calls.length, 0);
  assert.match(asked[0], /VE-1-1.*back into stock.*cannot be undone/);
});

test("Cancel, once confirmed, cancels the shipment", async () => {
  window.confirm = () => true;
  RTL.render(<DispatchControls shipment={shipment("pending")} roster={roster} />);
  await click(/^Cancel$/);
  assert.deepEqual(calls, [{ fn: "advance", input: { shipmentId: "s1", to: "cancelled" } }]);
});

test("on the road there is no Cancel — the goods are received back instead, with a reason and an attestation", async () => {
  window.prompt = () => "Customer was not at the site";
  window.confirm = () => true;
  RTL.render(<DispatchControls shipment={shipment("out_for_delivery")} roster={roster} />);
  assert.equal(RTL.screen.queryByRole("button", { name: /^Cancel$/ }), null);
  await click(/received back/i);
  assert.deepEqual(calls, [{ fn: "receivedBack", input: { shipmentId: "s1", reason: "Customer was not at the site", goodsReceivedBack: true } }]);
});

test("receiving back does nothing unless the operator confirms the goods are in the warehouse", async () => {
  window.prompt = () => "Customer was not at the site";
  window.confirm = () => false;
  RTL.render(<DispatchControls shipment={shipment("out_for_delivery")} roster={roster} />);
  await click(/received back/i);
  assert.equal(calls.length, 0);
});

test("a packed shipment is not offered 'received back'", () => {
  RTL.render(<DispatchControls shipment={shipment("packed")} roster={roster} />);
  assert.equal(RTL.screen.queryByRole("button", { name: /received back/i }), null);
});
