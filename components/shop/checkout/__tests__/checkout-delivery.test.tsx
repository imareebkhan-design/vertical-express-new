import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExpressChoice } from "@/components/shop/checkout/express-choice";
import { ShipmentReview } from "@/components/shop/checkout/shipment-review";
import type { ExpressOption } from "@/lib/services/express-delivery";

afterEach(cleanup);

/** W-B1-G1: the phone checkout asks the desktop's questions, through the same components. */

const option = (o: Partial<ExpressOption>): ExpressOption => ({
  available: false,
  feePaise: null,
  eligibleVariantIds: [],
  ineligibleVariantIds: [],
  ...o,
});

test("express on offer: two choices, the fee stated, and the choice reported", async () => {
  const picks: boolean[] = [];
  render(
    <ExpressChoice
      express={option({ available: true, reason: "mixed_cart", feePaise: 9900, eligibleVariantIds: ["a", "b"], ineligibleVariantIds: ["c"] })}
      wantsExpress={false}
      onChange={(v) => picks.push(v)}
      lineCount={3}
    />
  );
  const radios = screen.getAllByRole("radio") as HTMLInputElement[];
  assert.equal(radios.length, 2);
  assert.equal(radios[0].checked, true, "standard is the default");
  assert.match(document.body.textContent ?? "", /Express delivery · ₹99/);
  assert.match(document.body.textContent ?? "", /2 of 3 items can go on the express run/);
  await userEvent.setup().click(radios[1]);
  assert.deepEqual(picks, [true]);
});

test("every reason express is not offered is said as itself, with nothing to pick", () => {
  const cases: [ExpressOption["reason"], RegExp][] = [
    ["no_price", /not being offered yet — the charge for it has not been set/],
    ["not_serviceable", /We do not deliver to this pincode/],
    ["no_eligible_items", /Nothing in this basket is set up for express delivery/],
  ];
  for (const [reason, text] of cases) {
    render(<ExpressChoice express={option({ reason })} wantsExpress={false} onChange={() => {}} lineCount={2} />);
    assert.match(document.body.textContent ?? "", text);
    assert.equal(screen.queryAllByRole("radio").length, 0);
    cleanup();
  }
});

test("shipment review: one card per shipment, no arrival time, truck note only with a truck", () => {
  render(
    <ShipmentReview
      shipments={[
        { sequence: 1, speedClass: "express", itemCount: 3 },
        { sequence: 2, speedClass: "scheduled", itemCount: 2 },
      ]}
    />
  );
  assert.equal(screen.getAllByRole("listitem").length, 2);
  assert.ok(screen.getByRole("listitem", { name: "Shipment 2 of 2" }));
  assert.match(document.body.textContent ?? "", /2 shipments — they travel separately/);
  assert.match(document.body.textContent ?? "", /We will call to arrange the truck/);
  assert.doesNotMatch(document.body.textContent ?? "", /\d+ (min|hours?)\b|AM|PM/, "no time is claimed");
  cleanup();

  render(<ShipmentReview shipments={[{ sequence: 1, speedClass: "express", itemCount: 1 }]} />);
  assert.match(document.body.textContent ?? "", /One shipment\./);
  assert.doesNotMatch(document.body.textContent ?? "", /arrange the truck/);
});
