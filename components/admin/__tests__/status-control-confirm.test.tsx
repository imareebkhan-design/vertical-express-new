import test, { afterEach, before, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Staging UAT, 8 Nov 2026: choosing "→ cancelled" on a paid order cancelled it
 * at once, leaving a refund to issue. Cancelling now asks first; declining
 * changes nothing. Other moves are unchanged.
 */
const calls: { id: string; status: string }[] = [];
mock.module("@/actions/admin", {
  namedExports: {
    adminAdvanceOrder: async (id: string, status: string) => { calls.push({ id, status }); return { ok: true, data: null }; },
    adminAdvanceBooking: async (id: string, status: string) => { calls.push({ id, status }); return { ok: true, data: null }; },
  },
});
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() {} }) } });

let RTL: typeof import("@testing-library/react");
let StatusControl: typeof import("../status-control").StatusControl;
before(async () => {
  RTL = await import("@testing-library/react");
  ({ StatusControl } = await import("../status-control"));
});
afterEach(() => { RTL.cleanup(); calls.length = 0; });

const pick = async (value: string) => {
  const select = RTL.screen.getByRole("combobox") as HTMLSelectElement;
  await RTL.act(async () => { RTL.fireEvent.change(select, { target: { value } }); });
  await RTL.act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return select;
};

test("declining the confirmation does not cancel and resets the menu", async () => {
  const asked: string[] = [];
  window.confirm = (m?: string) => { asked.push(m ?? ""); return false; };
  RTL.render(<StatusControl kind="order" id="o1" options={["cancelled"]} />);
  const select = await pick("cancelled");
  assert.equal(calls.length, 0);
  assert.equal(select.value, "");
  assert.match(asked[0], /cannot be undone.*Refund required/);
});

test("accepting the confirmation cancels", async () => {
  window.confirm = () => true;
  RTL.render(<StatusControl kind="order" id="o1" options={["cancelled"]} />);
  await pick("cancelled");
  assert.deepEqual(calls, [{ id: "o1", status: "cancelled" }]);
});

test("a non-cancelling move is not interrupted by a confirmation", async () => {
  let asked = false;
  window.confirm = () => { asked = true; return false; };
  RTL.render(<StatusControl kind="booking" id="b1" options={["confirmed"]} />);
  await pick("confirmed");
  assert.equal(asked, false);
  assert.deepEqual(calls, [{ id: "b1", status: "confirmed" }]);
});
