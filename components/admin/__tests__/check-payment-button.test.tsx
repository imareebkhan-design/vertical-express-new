import test, { afterEach, before, mock } from "node:test";
import assert from "node:assert/strict";
import type { CheckOrderPayment } from "../check-payment-button";
import { adminPaymentCheckMessage, type AdminPaymentCheckResult } from "@/lib/admin-payment-check";

/**
 * B-4 — the "Check payment with Razorpay" button on an order awaiting payment.
 * One press asks once; the server's sentence is shown as it is; the page is
 * re-read only when the order changed.
 */
let refreshed = 0;
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() { refreshed++; } }) } });

let RTL: typeof import("@testing-library/react");
let CheckPaymentButton: typeof import("../check-payment-button").CheckPaymentButton;
before(async () => {
  RTL = await import("@testing-library/react");
  ({ CheckPaymentButton } = await import("../check-payment-button"));
});
afterEach(() => { RTL.cleanup(); refreshed = 0; });

const ORDER = "11111111-1111-4111-8111-111111111111";
const answer = (result: AdminPaymentCheckResult): CheckOrderPayment => async () => ({
  ok: true,
  data: { ...adminPaymentCheckMessage(result), result },
});

async function press(check: CheckOrderPayment) {
  RTL.render(<CheckPaymentButton orderId={ORDER} check={check} />);
  await RTL.act(async () => {
    RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Check payment with Razorpay" }));
  });
}

void test("one press asks once, for this order, and a confirmed payment refreshes the page", async () => {
  const calls: { orderId: string }[] = [];
  await press(async (input) => {
    calls.push(input);
    return answer("paid")(input);
  });
  assert.deepEqual(calls, [{ orderId: ORDER }]);
  assert.equal(RTL.screen.getByRole("status").textContent, adminPaymentCheckMessage("paid").message);
  assert.equal(refreshed, 1);
});

void test("nothing captured: the answer is shown and the page is not reloaded", async () => {
  await press(answer("not_captured"));
  assert.match(RTL.screen.getByRole("status").textContent ?? "", /Nothing was changed/);
  assert.equal(refreshed, 0);
});

void test("an unclear answer from Razorpay is shown as an alert", async () => {
  await press(answer("unknown"));
  assert.match(RTL.screen.getByRole("alert").textContent ?? "", /did not give a clear answer/);
  assert.equal(refreshed, 0);
});

void test("a refusal from the server is shown in its own words", async () => {
  await press(async () => ({ ok: false, error: { code: "FORBIDDEN", message: "Admin access required" } }));
  assert.equal(RTL.screen.getByRole("alert").textContent, "Admin access required");
});

void test("the answer stays on screen when the refreshed page no longer offers the button", async () => {
  const check = answer("late");
  const view = RTL.render(<CheckPaymentButton orderId={ORDER} check={check} available />);
  await RTL.act(async () => {
    RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Check payment with Razorpay" }));
  });
  view.rerender(<CheckPaymentButton orderId={ORDER} check={check} available={false} />);
  assert.equal(RTL.screen.queryByRole("button"), null, "the button goes once the order is no longer pending");
  assert.match(RTL.screen.getByRole("status").textContent ?? "", /refund review/, "the late-payment instruction stays");
});

void test("not available and nothing said yet: nothing is rendered", () => {
  const { container } = RTL.render(<CheckPaymentButton orderId={ORDER} check={answer("paid")} available={false} />);
  assert.equal(container.firstChild, null, "the component renders nothing");
});

void test("a lost connection does not pretend to know the answer", async () => {
  await press(async () => {
    throw new Error("network");
  });
  assert.match(RTL.screen.getByRole("alert").textContent ?? "", /could not be completed/);
});
