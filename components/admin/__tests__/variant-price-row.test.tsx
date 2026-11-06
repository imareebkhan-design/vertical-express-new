import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VariantPriceRow, paiseInput, type SaveVariantPrice } from "@/components/admin/variant-price-row";

afterEach(cleanup);

/**
 * ISS-068 — the price row on the product editor.
 *
 * Found in browser QA (5 Oct): the page has a second "Save" for the product's
 * details. A price typed into this row and then saved with THAT button showed
 * "Saved. Live on the storefront now." beside a leftover "Price saved." while
 * the stored price had not changed. A typed-but-unsaved price must say so, and
 * an old success message must not survive the next edit.
 */

const variant = { id: "v1", name: "bucket", sku: "VE-X", pricePaise: 154900, compareAtPaise: 249900, onHand: 500 };
const FIELD = "";
const ok: SaveVariantPrice = () => Promise.resolve({ ok: true, data: { changed: true } });
const selling = () => screen.getByLabelText("Selling (₹)") as HTMLInputElement;
const mrp = () => screen.getByLabelText("MRP (₹)") as HTMLInputElement;
const notSaved = () => screen.queryByText(/Not saved yet/);

test("paise render as the text an operator types", () => {
  assert.equal(paiseInput(154900), "1549");
  assert.equal(paiseInput(38550), "385.50");
  assert.equal(paiseInput(38505), "385.05");
  assert.equal(paiseInput(null), "");
});

test("stored values load into the fields; a blank MRP is an empty field showing 'None'", () => {
  render(<VariantPriceRow variant={{ ...variant, compareAtPaise: null }} field={FIELD} save={ok} />);
  assert.equal(selling().value, "1549");
  assert.equal(mrp().value, "");
  assert.equal(mrp().placeholder, "None");
  assert.equal(notSaved(), null, "nothing typed, nothing unsaved");
});

test("a typed price that has not been saved with this row says so", () => {
  render(<VariantPriceRow variant={variant} field={FIELD} save={ok} />);
  fireEvent.change(selling(), { target: { value: "1700" } });
  assert.ok(notSaved(), "an edited row must not look saved");
  fireEvent.change(selling(), { target: { value: "1549" } });
  assert.equal(notSaved(), null, "back to the stored value: nothing unsaved");
});

test("after a save the row is clean; the next edit clears 'Price saved' and shows it is unsaved again", async () => {
  const calls: Parameters<SaveVariantPrice>[0][] = [];
  const save: SaveVariantPrice = (input) => { calls.push(input); return ok(input); };
  render(<VariantPriceRow variant={variant} field={FIELD} save={save} />);
  fireEvent.change(selling(), { target: { value: "1599" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save price" })); });
  assert.deepEqual(calls[0], { variantId: "v1", price: "1599", mrp: "2499", shownPricePaise: 154900, shownCompareAtPaise: 249900 });
  assert.ok(screen.getByText("Price saved. New orders use it now."));
  assert.equal(notSaved(), null);

  fireEvent.change(selling(), { target: { value: "1700" } });
  assert.equal(screen.queryByText(/Price saved/), null, "the old success must not sit beside an unsaved edit");
  assert.ok(notSaved());

  /* The next save is checked against the price this row now shows (₹1,599). */
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save price" })); });
  assert.equal(calls[1].shownPricePaise, 159900);
});

test("a refusal is announced as an alert and nothing is shown as saved", async () => {
  const refuse: SaveVariantPrice = () =>
    Promise.resolve({ ok: false, error: { code: "CONFLICT", message: "This price was changed by someone else. Reload to see the current price." } });
  render(<VariantPriceRow variant={variant} field={FIELD} save={refuse} />);
  fireEvent.change(selling(), { target: { value: "1619" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save price" })); });
  assert.match(screen.getByRole("alert").textContent ?? "", /changed by someone else/);
  assert.equal(screen.queryByText(/Price saved/), null);
});
