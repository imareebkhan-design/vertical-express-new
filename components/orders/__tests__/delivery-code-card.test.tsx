import test, { afterEach, before } from "node:test";
import assert from "node:assert/strict";

/**
 * The web order page shows the delivery code and links to live tracking while
 * the goods are on the road (staging acceptance B6, 1 Nov 2026: the code was
 * reachable only on an unlinked /tracking page).
 */

let RTL: typeof import("@testing-library/react");
let DeliveryCodeCard: typeof import("../delivery-code-card").DeliveryCodeCard;
before(async () => {
  RTL = await import("@testing-library/react");
  ({ DeliveryCodeCard } = await import("../delivery-code-card"));
});
afterEach(() => RTL.cleanup());

test("out for delivery: the code is on the order page with a link to tracking", () => {
  RTL.render(<DeliveryCodeCard orderNo="VE-2026-TEST" shipments={[{ sequence: 1, deliveryCode: "482913" }]} />);
  assert.equal(RTL.screen.getByText("482913").textContent, "482913");
  const link = RTL.screen.getByRole("link", { name: /Track delivery/ });
  assert.equal(link.getAttribute("href"), "/account/orders/VE-2026-TEST/tracking");
  RTL.screen.getByText(/only when the material is at your gate/);
});

test("no code issued (not yet dispatched, delivered or cancelled): nothing is shown", () => {
  const { container } = RTL.render(
    <DeliveryCodeCard orderNo="VE-2026-TEST" shipments={[{ sequence: 1, deliveryCode: null }]} />
  );
  assert.equal(container.innerHTML, "");
});

test("two shipments, one on the road: only that shipment's code, labelled by shipment", () => {
  RTL.render(
    <DeliveryCodeCard
      orderNo="VE-2026-TEST"
      shipments={[{ sequence: 1, deliveryCode: null }, { sequence: 2, deliveryCode: "115577" }]}
    />
  );
  RTL.screen.getByText("Delivery code · shipment 2");
  RTL.screen.getByText("115577");
  assert.equal(RTL.screen.queryAllByText(/shipment 1/).length, 0);
});
