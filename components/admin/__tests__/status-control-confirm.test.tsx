import test, { afterEach, before, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Staging UAT, 8 Nov 2026: choosing "→ cancelled" on a paid order cancelled it
 * at once, leaving a refund to issue. Cancelling now asks first; declining
 * changes nothing. Other moves are unchanged.
 */
const calls: { id: string; status: string }[] = [];
type Result = { ok: true; data: null } | { ok: false; error: { code: string; message: string } };
const OK: Result = { ok: true, data: null };
/** What the next order move answers; a function may throw, as a lost connection does. */
let orderAnswer: () => Result = () => OK;
let refreshed = 0;
mock.module("@/actions/admin", {
  namedExports: {
    adminAdvanceOrder: async (id: string, status: string) => { calls.push({ id, status }); return orderAnswer(); },
    adminAdvanceBooking: async (id: string, status: string) => { calls.push({ id, status }); return OK; },
  },
});
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() { refreshed++; } }) } });

let RTL: typeof import("@testing-library/react");
let StatusControl: typeof import("../status-control").StatusControl;
before(async () => {
  RTL = await import("@testing-library/react");
  ({ StatusControl } = await import("../status-control"));
});
afterEach(() => { RTL.cleanup(); calls.length = 0; orderAnswer = () => OK; refreshed = 0; });

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

/**
 * A refused move used to show a bare "!" and discard the server's reason
 * (audit of 14 Nov 2026, ORD-04). The operator now reads the reason, and the
 * menu is ready for another attempt.
 */
const PAID = "Razorpay shows this order was paid, so it was not cancelled. Reload to see it. To cancel a paid order, cancel it again and refund it from Payments.";

test("a refused move shows the server's reason, re-reads the screen and leaves the menu usable", async () => {
  window.confirm = () => true;
  orderAnswer = () => ({ ok: false, error: { code: "CONFLICT", message: PAID } });
  RTL.render(<StatusControl kind="order" id="o1" options={["cancelled"]} />);
  await pick("cancelled");
  assert.equal(RTL.screen.getByRole("alert").textContent, PAID);
  assert.equal(refreshed, 1, "a payment found while cancelling changes the order, so the screen is re-read");
  const select = RTL.screen.getByRole("combobox") as HTMLSelectElement;
  assert.equal(select.value, "", "the menu is back on its prompt, not stuck on the refused option");
  assert.equal(select.disabled, false);
});

test("each refusal is shown in its own words, never as a bare symbol", async () => {
  for (const message of [
    "Packing, dispatch and delivery are done on the dispatch board for this order — delivery needs the customer's code.",
    "This order changed while you were looking at it. Reload and try again.",
  ]) {
    orderAnswer = () => ({ ok: false, error: { code: "CONFLICT", message } });
    RTL.render(<StatusControl kind="order" id="o1" options={["packed"]} />);
    await pick("packed");
    assert.equal(RTL.screen.getByRole("alert").textContent, message);
    assert.notEqual(RTL.screen.getByRole("alert").textContent?.trim(), "!");
    RTL.cleanup();
  }
});

test("a move whose answer never arrives says the outcome is unknown, without claiming nothing changed", async () => {
  orderAnswer = () => { throw new Error("network"); };
  RTL.render(<StatusControl kind="order" id="o1" options={["packed"]} />);
  await pick("packed");
  const text = RTL.screen.getByRole("alert").textContent ?? "";
  assert.match(text, /could not be confirmed/);
  assert.match(text, /Reload/);
  assert.doesNotMatch(text, /not changed|nothing was changed/i);
});

test("a successful move after a refusal clears the message", async () => {
  orderAnswer = () => ({ ok: false, error: { code: "CONFLICT", message: "That status change isn't allowed" } });
  RTL.render(<StatusControl kind="order" id="o1" options={["packed"]} />);
  await pick("packed");
  assert.ok(RTL.screen.getByRole("alert"));
  orderAnswer = () => OK;
  await pick("packed");
  assert.equal(RTL.screen.queryByRole("alert"), null);
});
