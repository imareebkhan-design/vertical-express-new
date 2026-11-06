import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CartLoadError } from "@/components/shop/cart-load-error";

afterEach(cleanup);

test("says the cart could not load and Retry re-reads it", async () => {
  let calls = 0;
  let finish!: () => void;
  render(<CartLoadError onRetry={() => { calls++; return new Promise<void>((r) => { finish = r; }); }} />);
  assert.match(screen.getByRole("alert").textContent ?? "", /couldn.t load your cart/);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  assert.equal(calls, 1);
  const busy = screen.getByRole("button", { name: "Retrying…" }) as HTMLButtonElement;
  assert.equal(busy.disabled, true, "no duplicate retries while one is out");
  finish();
  await waitFor(() => screen.getByRole("button", { name: "Retry" }));
});
