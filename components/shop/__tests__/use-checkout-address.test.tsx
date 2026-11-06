import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useCheckoutAddressSelection } from "../use-checkout-address";

/**
 * The address checkout delivers to survives everything that remounts
 * checkout: a reload, coming back to it, and the layout switching between
 * phone and desktop. Each of those is a fresh mount reading the same URL, so
 * that is what these tests do.
 */
const SAVED = [
  { id: "pinned-default", isDefault: true },
  { id: "old-unpinned", isDefault: false },
  { id: "just-added", isDefault: false },
];

function Harness({ addresses = SAVED }: { addresses?: typeof SAVED }) {
  const { addressId, select, requestedMissing } = useCheckoutAddressSelection(addresses);
  return (
    <div>
      <p data-testid="selected">{addressId || "(none)"}</p>
      <p data-testid="missing">{String(requestedMissing)}</p>
      {addresses.map((a) => (
        <button key={a.id} type="button" onClick={() => select(a.id)}>
          pick {a.id}
        </button>
      ))}
    </div>
  );
}

const selected = () => screen.getByTestId("selected").textContent;
const missing = () => screen.getByTestId("missing").textContent;
const at = (url: string) => window.history.replaceState(null, "", url);
/** A reload, a return to checkout, or the layout swapping: unmount, mount again on the same URL. */
function remount(addresses = SAVED) {
  cleanup();
  render(<Harness addresses={addresses} />);
}

beforeEach(() => at("/checkout"));
afterEach(cleanup);

test("with nothing chosen yet, checkout starts on the default", () => {
  render(<Harness />);
  assert.equal(selected(), "pinned-default");
  assert.equal(missing(), "false");
});

test("a pick is written into the URL, and survives a reload or layout switch", () => {
  render(<Harness />);
  act(() => fireEvent.click(screen.getByRole("button", { name: "pick old-unpinned" })));
  assert.equal(selected(), "old-unpinned");
  assert.equal(window.location.search, "?address=old-unpinned");
  remount();
  assert.equal(selected(), "old-unpinned", "not quietly put back on the default");
});

test("back from adding an address, the new one is selected — and stays selected", () => {
  at("/checkout?address=just-added");
  render(<Harness />);
  assert.equal(selected(), "just-added");
  remount();
  assert.equal(selected(), "just-added");
});

test("other parameters in the URL are kept when a pick is written", () => {
  at("/checkout?utm=x");
  render(<Harness />);
  act(() => fireEvent.click(screen.getByRole("button", { name: "pick just-added" })));
  assert.equal(new URLSearchParams(window.location.search).get("utm"), "x");
  assert.equal(new URLSearchParams(window.location.search).get("address"), "just-added");
});

test("an address that is no longer theirs is reported, not silently replaced", () => {
  at("/checkout?address=deleted-one");
  render(<Harness />);
  assert.equal(missing(), "true");
  assert.equal(selected(), "pinned-default", "starts somewhere sensible, but says so");
  act(() => fireEvent.click(screen.getByRole("button", { name: "pick just-added" })));
  assert.equal(missing(), "false", "a fresh pick clears the notice");
});

test("if the selected address is removed, nothing is selected — never a different address", () => {
  at("/checkout?address=old-unpinned");
  render(<Harness />);
  assert.equal(selected(), "old-unpinned");
  cleanup();
  const { rerender } = render(<Harness />);
  rerender(<Harness addresses={SAVED.filter((a) => a.id !== "old-unpinned")} />);
  assert.equal(selected(), "(none)");
});
