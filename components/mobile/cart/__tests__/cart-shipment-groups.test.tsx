import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CartShipmentGroups } from "@/components/mobile/cart/cart-shipment-groups";
import { groupCartByShipment } from "@/lib/cart-shipments";
import type { CartLine } from "@/lib/services/cart";

afterEach(cleanup);

/** W-18: the phone-web cart shows the same split checkout persists. */

const line = (itemId: string, title: string, qty: number, bulk: boolean): CartLine =>
  ({
    itemId,
    title,
    qty,
    categoryIsBulk: bulk,
    deliverySpeed: null,
    unitPricePaise: 10000,
    lineTotalPaise: 10000 * qty,
    imageUrl: null,
  }) as unknown as CartLine;

const MIXED = [line("c", "PPC Cement, 50 kg Bag", 2, true), line("w", "FR Wire 2.5 sq mm", 1, false), line("s", "Switch", 3, false)];
const noop = () => {};

test("a mixed basket shows two shipment cards, quick first, each holding its own lines", () => {
  render(<CartShipmentGroups shipments={groupCartByShipment(MIXED)} count={6} pending={false} onDecrease={noop} onIncrease={noop} onRemove={noop} />);
  const first = screen.getByRole("region", { name: "Shipment 1 of 2" });
  const second = screen.getByRole("region", { name: "Shipment 2 of 2" });
  assert.match(first.textContent ?? "", /FR Wire/);
  assert.match(first.textContent ?? "", /Switch/);
  assert.doesNotMatch(first.textContent ?? "", /Cement/);
  assert.match(second.textContent ?? "", /PPC Cement/);
  assert.match(first.textContent ?? "", /4 items/, "units in the shipment");
  assert.match(second.textContent ?? "", /Heavy material by truck/);
  assert.match(document.body.textContent ?? "", /6 items, splitting into two shipments/);
  assert.match(document.body.textContent ?? "", /no delivery time is set for either yet/);
});

test("one kind of goods is one card with no split talk", () => {
  const lines = [line("w", "Wire", 1, false), line("s", "Switch", 2, false)];
  render(<CartShipmentGroups shipments={groupCartByShipment(lines)} count={3} pending={false} onDecrease={noop} onIncrease={noop} onRemove={noop} />);
  assert.equal(screen.getAllByRole("region").length, 1);
  assert.equal(screen.queryByText(/Shipment 1 of/), null);
  assert.equal(screen.queryByText(/splitting into/), null);
});

test("the steppers and remove act on the line they sit on", async () => {
  const calls: string[] = [];
  render(
    <CartShipmentGroups
      shipments={groupCartByShipment(MIXED)}
      count={6}
      pending={false}
      onDecrease={(id, q) => calls.push(`dec ${id} ${q}`)}
      onIncrease={(id, q) => calls.push(`inc ${id} ${q}`)}
      onRemove={(id) => calls.push(`rm ${id}`)}
    />
  );
  const user = userEvent.setup();
  const truck = screen.getByRole("region", { name: "Shipment 2 of 2" });
  await user.click(within(truck).getByRole("button", { name: "Increase PPC Cement, 50 kg Bag" }));
  await user.click(screen.getByRole("button", { name: "Decrease Switch" }));
  await user.click(screen.getByRole("button", { name: "Remove FR Wire 2.5 sq mm" }));
  assert.deepEqual(calls, ["inc c 2", "dec s 3", "rm w"]);
});

test("steppers are disabled while a change is in flight", () => {
  render(<CartShipmentGroups shipments={groupCartByShipment(MIXED)} count={6} pending onDecrease={noop} onIncrease={noop} onRemove={noop} />);
  assert.equal((screen.getByRole("button", { name: "Increase Switch" }) as HTMLButtonElement).disabled, true);
});
