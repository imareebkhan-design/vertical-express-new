import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadRazorpayScript } from "@/lib/razorpay-script";

/**
 * The payment window's script, when it cannot be loaded.
 *
 * A content blocker or a dropped connection fails the <script>. The old loaders
 * left the failed tag in the page, so a second attempt waited on it for ever,
 * and the first rejection went uncaught after the order had been created.
 */
const tag = () => document.getElementById("razorpay-checkout-js");
const win = window as unknown as { Razorpay?: unknown };

afterEach(() => {
  tag()?.remove();
  delete win.Razorpay;
});

test("a blocked script rejects, and its tag is removed so the next attempt is a real one", async () => {
  const first = loadRazorpayScript();
  const el = tag();
  assert.ok(el, "the script tag was added");
  el!.dispatchEvent(new window.Event("error"));
  await assert.rejects(first, /razorpay script failed/);
  assert.equal(tag(), null, "the failed tag does not stay in the page");

  const second = loadRazorpayScript();
  assert.ok(tag(), "a retry adds a fresh tag");
  win.Razorpay = function () {};
  tag()!.dispatchEvent(new window.Event("load"));
  await second;
});

test("two callers waiting on the same tag both hear its failure", async () => {
  const a = loadRazorpayScript();
  const b = loadRazorpayScript();
  assert.equal(document.querySelectorAll("#razorpay-checkout-js").length, 1, "one tag, not two");
  tag()!.dispatchEvent(new window.Event("error"));
  await assert.rejects(a);
  await assert.rejects(b);
});

test("already loaded: resolves without touching the page", async () => {
  win.Razorpay = function () {};
  await loadRazorpayScript();
  assert.equal(tag(), null);
});
