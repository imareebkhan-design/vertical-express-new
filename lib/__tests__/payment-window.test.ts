import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHECKOUT_MARGIN_SECONDS,
  isLatePaid,
  PAYMENT_WINDOW_MINUTES,
  checkoutTimeoutSeconds,
  payByFor,
  paymentTermsFor,
} from "@/lib/payment-window";

/**
 * Razorpay Checkout must close before the order it pays for can expire.
 *
 * REGRESSION (staging, 8 Oct 2026): order VE-2026-MUZ7TZF154CC was placed at
 * 07:29, auto-cancelled at 07:45, and its Checkout — still open, with no
 * timeout — took a TEST payment at 08:00. The money was recorded against a
 * dead order: refund owed, nothing shipped.
 */

const PLACED = new Date("2026-10-08T07:29:13.008Z");
const at = (minutes: number) => PLACED.getTime() + minutes * 60_000;

test("payBy is placement plus the window the expiry job enforces", () => {
  assert.equal(payByFor(PLACED), "2026-10-08T07:44:13.008Z");
  assert.equal(PAYMENT_WINDOW_MINUTES, 15);
  assert.deepEqual(paymentTermsFor(PLACED, at(0)), { payBy: "2026-10-08T07:44:13.008Z", payWithinSeconds: 900 });
  assert.equal(paymentTermsFor(PLACED, at(14.9)).payWithinSeconds, 6, "rounded down, never up");
});

test("a fresh order gets the window less the margin; a nearly expired one does not open", () => {
  const terms = (m: number) => paymentTermsFor(PLACED, at(m));
  assert.equal(checkoutTimeoutSeconds(terms(0)), 15 * 60 - CHECKOUT_MARGIN_SECONDS);
  assert.equal(checkoutTimeoutSeconds(terms(13)), 60, "two minutes left: one minute of Checkout");
  assert.equal(checkoutTimeoutSeconds(terms(13.5)), "closed");
  assert.equal(checkoutTimeoutSeconds(terms(31)), "closed", "the staging order's payment time");
  assert.equal(checkoutTimeoutSeconds({ payWithinSeconds: -5 }), "closed");
});

test("a phone whose clock is wrong still gets the server's deadline", () => {
  /* The server answers at placement: 900 s left. The phone's clock runs ten
     minutes slow, so by its own clock payBy is 25 minutes away. */
  const serverTerms = paymentTermsFor(PLACED, at(0));
  const phoneNow = at(0) - 10 * 60_000;
  assert.equal(checkoutTimeoutSeconds(serverTerms, phoneNow), 900 - CHECKOUT_MARGIN_SECONDS, "server-relative seconds win");
  assert.equal(checkoutTimeoutSeconds({ payBy: serverTerms.payBy }, phoneNow), 25 * 60 - CHECKOUT_MARGIN_SECONDS,
    "absolute payBy alone would trust the wrong clock — why payWithinSeconds is sent");
});

test("however late Checkout opens, it closes before the order can expire", () => {
  for (let s = 0; s <= 16 * 60; s += 7) {
    const now = PLACED.getTime() + s * 1000;
    const terms = paymentTermsFor(PLACED, now);
    const t = checkoutTimeoutSeconds(terms, now);
    if (t === "closed") continue;
    assert.ok(t !== null);
    assert.ok(now + t * 1000 <= Date.parse(terms.payBy) - CHECKOUT_MARGIN_SECONDS * 1000, `opened at +${s}s it would outlive the window`);
  }
});

test("no terms from the server (older server) leaves Checkout as it was", () => {
  assert.equal(checkoutTimeoutSeconds(null), null);
  assert.equal(checkoutTimeoutSeconds(undefined), null);
  assert.equal(checkoutTimeoutSeconds({}), null);
  assert.equal(checkoutTimeoutSeconds({ payBy: "not a date" }), null);
  assert.equal(checkoutTimeoutSeconds({ payBy: payByFor(PLACED) }, at(0)), 15 * 60 - CHECKOUT_MARGIN_SECONDS, "payBy alone still works");
});

/* Every web surface that opens Razorpay Checkout must hold it inside the window.
   None of the four did; a fifth added later would reopen the hole without this. */
const COMPONENTS = fileURLToPath(new URL("../../components/", import.meta.url));
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = join(dir, n);
    if (statSync(full).isDirectory()) return n === "__tests__" ? [] : files(full);
    return /\.tsx?$/.test(n) ? [full] : [];
  });
}

test("every web Razorpay Checkout passes the window's timeout", () => {
  const openers = files(COMPONENTS).filter((f) => /new Razorpay\(/.test(readFileSync(f, "utf8")));
  assert.ok(openers.length >= 4, `expected the checkout, retry and order-page openers, found ${openers.length}`);
  for (const f of openers) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /checkoutTimeoutSeconds\(rzp\)/, `${f} opens Checkout without the payment window`);
    assert.match(src, /\{ timeout \}/, `${f} computes the window but does not pass it to Checkout`);
  }
});

test("a cancelled order with a captured payment is the refund-owed case the order page must explain", () => {
  /* VE-2026-MUZ7TZF154CC on staging: cancelled, payment captured, and the page said only "cancelled". */
  assert.equal(isLatePaid({ status: "cancelled", payments: [{ status: "captured" }] }), true);
  assert.equal(isLatePaid({ status: "cancelled", payments: [{ status: "created" }] }), false, "expired unpaid: nothing owed");
  assert.equal(isLatePaid({ status: "confirmed", payments: [{ status: "captured" }] }), false);
  assert.equal(isLatePaid({ status: "refunded", payments: [{ status: "captured" }] }), false, "already refunded says so itself");
  assert.equal(isLatePaid({ status: "cancelled", payments: [] }), false);
});
