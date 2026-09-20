import { fail, type ActionResult } from "@/lib/validators";

/**
 * Turning a `placeOrder` service throw into a result the caller can render.
 *
 * Lifted out of `actions/checkout.ts` so the native API answers a refusal with
 * exactly the words and codes the storefront does. Pure: no database, no
 * Next.js.
 */
export function classifyPlaceOrderError<T>(e: unknown): ActionResult<T> {
  const msg = e instanceof Error ? e.message : "Could not place order";
  if (msg.startsWith("OUT_OF_STOCK:")) {
    return fail("OUT_OF_STOCK", `${msg.split(":")[1]} is out of stock`);
  }
  if (msg === "PINCODE_UNSERVICEABLE") return fail("PINCODE_UNSERVICEABLE", "This pincode isn't serviceable");
  if (msg === "COD_UNAVAILABLE") return fail("CONFLICT", "Pay on delivery isn't available here");
  if (msg === "CART_EMPTY") return fail("CONFLICT", "Your cart is empty");
  if (msg === "ADDRESS_NOT_FOUND") return fail("NOT_FOUND", "Select a valid delivery address");
  return fail("PAYMENT_FAILED", "Something went wrong placing your order");
}
