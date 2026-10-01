import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render } from "@testing-library/react";
import { ExpressChoice } from "@/components/shop/checkout/express-choice";
import { ShipmentReview } from "@/components/shop/checkout/shipment-review";
import type { ExpressOption } from "@/lib/services/express-delivery";

afterEach(cleanup);

/**
 * E7 — what the express choice and "Your shipments" claim must match the split
 * that is persisted. Heavy goods go by truck whatever is chosen, so standard is
 * "everything together" only when the basket really is one delivery.
 */

const mixed: ExpressOption = {
  available: true,
  reason: "mixed_cart",
  feePaise: 7700,
  eligibleVariantIds: ["v-switch"],
  ineligibleVariantIds: ["v-tape", "v-cement"],
};

test("standard makes two deliveries (a truck item): no 'everything together' or 'one delivery' claim", () => {
  const { container } = render(
    <ExpressChoice express={mixed} wantsExpress={false} onChange={() => {}} lineCount={3} standardShipments={2} />
  );
  const text = container.textContent ?? "";
  assert.doesNotMatch(text, /everything together/);
  assert.doesNotMatch(text, /one delivery/);
  assert.match(text, /Some of this basket can’t go on the express run\./);
  assert.match(text, /1 of 3 items can go on the express run\. The rest follow separately\./);
});

test("standard really is one delivery: the wording says so, as before", () => {
  const { container } = render(
    <ExpressChoice express={mixed} wantsExpress={false} onChange={() => {}} lineCount={2} standardShipments={1} />
  );
  const text = container.textContent ?? "";
  assert.match(text, /Standard · everything together/);
  assert.match(text, /keeps the order in one delivery/);
});

test("Your shipments names the express run the customer chose, and no other shipment", () => {
  const { getAllByRole, container } = render(
    <ShipmentReview
      shipments={[
        { sequence: 1, speedClass: "express", expressRun: true, itemCount: 1 },
        { sequence: 2, speedClass: "express", itemCount: 1 },
        { sequence: 3, speedClass: "scheduled", itemCount: 1 },
      ]}
    />
  );
  const items = getAllByRole("listitem").map((li) => li.textContent ?? "");
  assert.match(items[0], /On the express run you chose\./);
  assert.match(items[1], /Small goods, out from the Srinagar store\./);
  assert.match(items[2], /Heavy material, by truck\./);
  assert.match(container.textContent ?? "", /3 shipments — they travel separately\./);
});
