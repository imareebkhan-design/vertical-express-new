import test, { afterEach, before, mock } from "node:test";
import assert from "node:assert/strict";

let state: "pending" | "failed" = "pending";
const unused = () => { throw new Error("Unexpected payment action"); };
mock.module("@/actions/orders", { namedExports: {
  cancelOrder: unused, reorder: unused, retryOrderPayment: unused,
  checkPaymentStatus: async () => ({ ok: true, data: { state } }),
} });
mock.module("@/actions/checkout", { namedExports: { confirmRazorpayPayment: unused } });
mock.module("@/hooks/use-cart", { namedExports: { useCart: () => ({ refresh: unused }) } });
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh: unused }) } });

let rtl: typeof import("@testing-library/react");
let Desktop: typeof import("../order-actions").OrderActions;
let Mobile: typeof import("@/components/mobile/account/mobile-order-detail-view").MobileOrderDetailView;
before(async () => {
  rtl = await import("@testing-library/react");
  ({ OrderActions: Desktop } = await import("../order-actions"));
  ({ MobileOrderDetailView: Mobile } = await import("@/components/mobile/account/mobile-order-detail-view"));
});
afterEach(() => rtl.cleanup());

const order = {
  orderNo: "F1-FIXTURE", status: "pending_payment", paymentMethod: "razorpay", payments: [{ status: "authorized" }],
  placedAt: "2026-01-01T00:00:00Z", items: [], address: {}, totalPaise: 10000, subtotalPaise: 10000,
  taxPaise: 0, deliveryFeePaise: 0, discountPaise: 0,
};

for (const surface of ["desktop", "mobile"]) {
  test(`${surface} order detail offers a status check until the server establishes a failed attempt`, async () => {
    state = "pending";
    rtl.render(surface === "desktop"
      ? <Desktop orderNo={order.orderNo} status={order.status} cancelState={{ kind: "paid-online" }} />
      : <Mobile order={order} shipments={[]} />);
    const check = await rtl.screen.findByRole("button", { name: "Check payment status" });
    assert.ok(rtl.screen.getByText(/please don't pay again yet/i));
    assert.equal(rtl.screen.queryByText(/this order is paid/i), null);
    assert.equal(rtl.screen.queryByRole("button", { name: /complete payment|pay now/i }), null);
    state = "failed";
    await rtl.act(async () => rtl.fireEvent.click(check));
    assert.ok(await rtl.screen.findByRole("button", { name: "Pay now" }));
  });
}
