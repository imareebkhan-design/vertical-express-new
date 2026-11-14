/**
 * Loads Razorpay Checkout once, in the browser.
 *
 * Two screens carried their own copy, and both had the same two faults. A
 * failed load (a content blocker, a dropped connection) rejected with nothing
 * catching it — by then the order exists and its stock is held, and the
 * customer landed on the site's error page. And the failed <script> tag stayed
 * in the document, so the next attempt found it, waited for a `load` event that
 * had already not happened, and never settled.
 *
 * Here a failed tag is removed, so a retry really retries, and a second caller
 * waiting on a tag that is still loading hears its failure as well as its
 * success. Callers must still catch: see `checkout-view.tsx`.
 */
const SCRIPT_ID = "razorpay-checkout-js";
const SRC = "https://checkout.razorpay.com/v1/checkout.js";

export function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve();
    const fail = (el: HTMLElement) => () => {
      el.remove();
      reject(new Error("razorpay script failed"));
    };
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", fail(existing));
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SRC;
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", fail(s));
    document.body.appendChild(s);
  });
}

/** Shown when the payment window cannot be loaded for an order that already exists. */
export const PAYMENT_WINDOW_UNAVAILABLE_MESSAGE =
  "The payment window couldn't be loaded, so nothing has been charged. Your order is saved — check your connection or any content blocker, then pay from the order.";
