import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RefundControl, type RefundPayment } from "@/components/admin/refund-control";

afterEach(cleanup);

/**
 * ISS-025 — refunding a payment from the "Refund required" list. Money that
 * leaves cannot be called back, so one click must never send it, and nothing is
 * sent without a written reason.
 */

const REASON = "Order cancelled after the capture arrived";

function setup(refund: RefundPayment) {
  render(<RefundControl paymentId="11111111-1111-4111-8111-111111111111" amountPaise={39800} refund={refund} />);
  fireEvent.click(screen.getByRole("button", { name: "Refund…" }));
}
const reasonBox = () => screen.getByLabelText("Why is this being refunded?");

test("one click arms the refund; only the second sends it, once", async () => {
  const calls: { paymentId: string; reason: string }[] = [];
  setup(async (input) => {
    calls.push(input);
    return { ok: true, data: { refundId: "r1", status: "processed" } };
  });
  fireEvent.change(reasonBox(), { target: { value: REASON } });
  fireEvent.click(screen.getByRole("button", { name: "Refund ₹398" }));
  assert.equal(calls.length, 0, "the first click must not send money");
  const confirm = screen.getByRole("button", { name: "Confirm: send ₹398 back" });
  await act(async () => {
    fireEvent.click(confirm);
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { paymentId: "11111111-1111-4111-8111-111111111111", reason: REASON });
  assert.match(screen.getByRole("status").textContent ?? "", /Refunded/);
});

test("without a reason nothing can be sent", () => {
  setup(async () => {
    throw new Error("must not be called");
  });
  fireEvent.change(reasonBox(), { target: { value: "too short" } });
  assert.equal((screen.getByRole("button", { name: "Refund ₹398" }) as HTMLButtonElement).disabled, true);
});

test("editing the reason disarms a primed refund", () => {
  setup(async () => ({ ok: true, data: { refundId: "r1", status: "processed" } }));
  fireEvent.change(reasonBox(), { target: { value: REASON } });
  fireEvent.click(screen.getByRole("button", { name: "Refund ₹398" }));
  fireEvent.change(reasonBox(), { target: { value: REASON + "." } });
  assert.ok(screen.getByRole("button", { name: "Refund ₹398" }), "back to the unarmed button");
});

test("a refusal is shown, not hidden", async () => {
  setup(async () => ({ ok: false, error: { code: "PAYMENT_FAILED", message: "Razorpay refused the refund. Nothing was sent; the payment is still owed" } }));
  fireEvent.change(reasonBox(), { target: { value: REASON } });
  fireEvent.click(screen.getByRole("button", { name: "Refund ₹398" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Confirm: send ₹398 back" }));
  });
  assert.match(screen.getByRole("alert").textContent ?? "", /Razorpay refused/);
});
