import { handleAddCartItem } from "@/lib/api/cart-items";

/**
 * POST /api/v1/cart/items
 *
 * Deliberately four lines. The handler lives in `lib/api/cart-items.ts` so it
 * can be driven directly by `lib/services/__tests__/cart-api.test.ts` with a
 * stubbed token verifier — a route module cannot be, because a test has no
 * Firebase service account and `firebase-admin` refuses to verify without one
 * (correctly: a verifier that cannot verify must fail loudly, not wave requests
 * through).
 *
 * The seam is the verifier and nothing else, and it is not passed here. That is
 * asserted by a test reading this file, so the production path cannot acquire
 * an injected verifier without the suite saying so.
 *
 * `/v1` is in the path, not a header. The app on somebody's phone is a client
 * that cannot be forced to update, so this contract has to be able to age
 * alongside a successor rather than be replaced under it.
 */
export async function POST(request: Request) {
  return handleAddCartItem(request);
}
