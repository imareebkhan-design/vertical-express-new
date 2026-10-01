import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, renderHook } from "@testing-library/react";
import { CartStateProvider, useCart, type CartActions } from "../cart-provider";
import { announceAuthChanged } from "@/lib/auth/auth-events";
import type { CartSummary } from "@/lib/services/cart";

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const summary = (id: string): CartSummary => ({
  cartId: id, lines: [], count: 2, subtotalPaise: 2000,
  freeDeliveryThresholdPaise: 50000, freeDeliveryRemainingPaise: 48000, qualifiesFreeDelivery: false,
});
function setup() {
  const carts: ReturnType<typeof deferred<CartSummary>>[] = [];
  const wishes: ReturnType<typeof deferred<string[]>>[] = [];
  const adds: ReturnType<typeof deferred<Awaited<ReturnType<CartActions["addToCart"]>>>>[] = [];
  const removes: ReturnType<typeof deferred<Awaited<ReturnType<CartActions["removeCartItem"]>>>>[] = [];
  const actions: CartActions = {
    getCart: () => { const d = deferred<CartSummary>(); carts.push(d); return d.promise; },
    getMyWishlistIds: () => { const d = deferred<string[]>(); wishes.push(d); return d.promise; },
    addToCart: () => { const d = deferred<Awaited<ReturnType<CartActions["addToCart"]>>>(); adds.push(d); return d.promise; },
    updateCartItem: async () => { throw new Error("Unexpected update"); },
    removeCartItem: () => { const d = deferred<Awaited<ReturnType<CartActions["removeCartItem"]>>>(); removes.push(d); return d.promise; },
  };
  const hook = renderHook(useCart, { wrapper: ({ children }) => <CartStateProvider actions={actions}>{children}</CartStateProvider> });
  return { ...hook, carts, wishes, adds, removes };
}

test("auth change immediately clears cart and wishlist while the replacement requests are pending", async () => {
  const h = setup();
  await act(async () => { h.carts[0].resolve(summary("alice")); h.wishes[0].resolve(["private-product"]); });
  assert.equal(h.result.current.count, 2);
  act(announceAuthChanged);
  assert.equal(h.result.current.summary.cartId, null);
  assert.equal(h.result.current.count, 0);
  assert.equal(h.result.current.loaded, false);
  assert.equal(h.result.current.wishlistIds.size, 0);
});

test("responses started before account switching cannot restore the previous account", async () => {
  const h = setup();
  act(announceAuthChanged);
  await act(async () => { h.carts[1].resolve(summary("bob")); h.wishes[1].resolve(["bob-product"]); });
  await act(async () => { h.carts[0].resolve(summary("alice")); h.wishes[0].resolve(["alice-product"]); });
  assert.equal(h.result.current.summary.cartId, "bob");
  assert.deepEqual([...h.result.current.wishlistIds], ["bob-product"]);
});

test("an in-flight add cannot restore a signed-out customer's cart or toast", async () => {
  const h = setup();
  await act(async () => { h.carts[0].resolve(summary("alice")); h.wishes[0].resolve([]); });
  let adding!: Promise<boolean>;
  act(() => { adding = h.result.current.addItem("variant", 1, "Private product"); });
  act(announceAuthChanged);
  await act(async () => { h.carts[1].resolve({ ...summary("guest"), count: 0 }); h.wishes[1].resolve([]); });
  await act(async () => { h.adds[0].resolve({ ok: true, data: summary("alice") }); await adding; });
  assert.equal(h.result.current.summary.cartId, "guest");
  assert.equal(h.result.current.lastAddedTitle, null);
  assert.equal(h.result.current.count, 0);
});

test("a late refresh cannot overwrite a newer tab-visibility refresh", async () => {
  const h = setup();
  let oldRead!: Promise<void>;
  let newRead!: Promise<void>;
  act(() => { oldRead = h.result.current.refresh(); newRead = h.result.current.refresh(); });
  await act(async () => { h.carts[2].resolve(summary("new")); await newRead; });
  await act(async () => { h.carts[1].resolve(summary("old")); await oldRead; });
  assert.equal(h.result.current.summary.cartId, "new");
});

test("a cart change or re-read keeps the cart on screen: `loaded` stays true (no skeleton on every tap)", async () => {
  const h = setup();
  await act(async () => { h.carts[0].resolve(summary("alice")); h.wishes[0].resolve([]); });
  assert.equal(h.result.current.loaded, true);
  act(() => { void h.result.current.removeItem("line-1"); });
  assert.equal(h.result.current.loaded, true, "removing a line must not replace the cart with a skeleton");
  act(() => { void h.result.current.refresh(); });
  assert.equal(h.result.current.loaded, true, "a tab-return re-read must not replace the cart with a skeleton");
  await act(async () => { h.removes[0].resolve({ ok: true, data: summary("alice") }); });
  await act(async () => { h.carts[1].resolve(summary("alice")); });
  assert.equal(h.result.current.loaded, true);
});

test("answers out of order: the older write's answer is not shown, and the cart is re-read once after the last write", async () => {
  const h = setup();
  await act(async () => { h.carts[0].resolve(summary("start")); h.wishes[0].resolve([]); });
  let first!: Promise<boolean>;
  let second!: Promise<boolean>;
  act(() => { first = h.result.current.addItem("a", 1); second = h.result.current.addItem("b", 1); });
  await act(async () => { h.adds[1].resolve({ ok: true, data: summary("after-b") }); await second; });
  assert.equal(h.result.current.summary.cartId, "after-b");
  assert.equal(h.carts.length, 1, "no re-read while the earlier write is still out");
  await act(async () => { h.adds[0].resolve({ ok: true, data: summary("after-a-only") }); await first; });
  assert.equal(h.result.current.summary.cartId, "after-b", "the stale answer is never shown");
  assert.equal(h.carts.length, 2, "exactly one reconciling read once no write is out");
  await act(async () => { h.carts[1].resolve(summary("server-final")); });
  assert.equal(h.result.current.summary.cartId, "server-final");
});

test("focusing the window (side-by-side windows) re-reads the cart", async () => {
  const h = setup();
  await act(async () => { h.carts[0].resolve(summary("before")); h.wishes[0].resolve([]); });
  act(() => { window.dispatchEvent(new window.Event("focus")); });
  await act(async () => { h.carts[1].resolve(summary("changed-elsewhere")); });
  assert.equal(h.result.current.summary.cartId, "changed-elsewhere");
});
