import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyCartError, type CartStockAdjustment } from "@/lib/cart-errors";

/**
 * One classification of a cart refusal, shared by the Server Action and the
 * HTTP endpoint.
 *
 * `lib/services/cart.ts` refuses by throwing a tagged string. Deciding whether
 * a throw is a refusal the customer can act on or a fault they cannot, and
 * digging the numbers back out of it, used to live inline in `addToCart`.
 * `POST /api/v1/cart/items` performs the same operation for the native app, so
 * either the two share this function or they drift — and this repository has
 * already shipped that exact drift once, in a mobile checkout view that applied
 * a coupon and then placed the order without it.
 *
 * Pure, so it is tested directly with no database.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The refusals as `lib/services/cart.ts` actually writes them. */
const OUT_OF_STOCK = new Error("OUT_OF_STOCK:This item is currently unavailable.");
const ONLY_X_LEFT = new Error("ONLY_X_LEFT:Only 5 items are available. Requested: 8");

function adjustment(result: ReturnType<typeof classifyCartError>): CartStockAdjustment {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  return result.error.metadata as CartStockAdjustment;
}

test("an out-of-stock refusal keeps its own code", () => {
  const res = classifyCartError(OUT_OF_STOCK, 3);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "OUT_OF_STOCK");
  assert.equal(adjustment(res).status, "out_of_stock");
  assert.equal(adjustment(res).available, 0);
});

test("a limited refusal carries the numbers the screen needs", () => {
  const res = classifyCartError(ONLY_X_LEFT, 8);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "ONLY_X_LEFT");

  const meta = adjustment(res);
  assert.equal(meta.status, "limited");
  assert.equal(meta.available, 5, "the screen cannot offer '5 left' without the 5");
  assert.equal(meta.requested, 8);
});

test("the message reaches the customer whole", () => {
  /* The bug this pins. The service writes
   *   "ONLY_X_LEFT:Only 5 items are available. Requested: 8"
   * and the previous inline version read `errorMsg.split(":")[1]`, which stops
   * at the SECOND colon. The customer was shown "Only 5 items are available.
   * Requested" — a sentence cut off mid-clause. The same truncation is why the
   * /Requested: (\d+)/ match in that block could never fire, which is the proof
   * that a whole message was always what was meant. */
  const res = classifyCartError(ONLY_X_LEFT, 8);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.message, "Only 5 items are available. Requested: 8");
  assert.ok(
    !res.error.message.endsWith("Requested"),
    "the message is truncated at the second colon again"
  );
});

test("an unrecognised throw is not dressed up as a stock problem", () => {
  /* "Variant not found" and "No cart context" are both thrown by addItem. From
     the customer's side an item that cannot be added for a reason we cannot
     name is indistinguishable from one that is not there — but it must not be
     reported as a stock level, because the UI offers "try a smaller quantity"
     on that path and no quantity would work. */
  for (const err of [new Error("Variant not found"), new Error("No cart context"), new Error(""), "not an error", null]) {
    const res = classifyCartError(err, 1);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "NOT_FOUND", `${String(err)} was misclassified`);
  }
});

test("a code that merely starts the same is not a stock refusal", () => {
  /* `startsWith` was the previous test, so a future "OUT_OF_STOCK_REGION:…"
     would have been read as OUT_OF_STOCK and shown a quantity that does not
     apply. Matching the whole prefix closes that. */
  const res = classifyCartError(new Error("OUT_OF_STOCK_REGION:not delivered here"), 1);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "NOT_FOUND");
});

test("both surfaces route through this function rather than their own copy", () => {
  /* The point of the file. A source check, because the failure is invisible at
     runtime: two copies agree perfectly until the day one of them is fixed. */
  for (const rel of ["actions/cart.ts", "lib/api/cart-items.ts"]) {
    /* Import lines are stripped first. Matching the bare name passed while the
       call had been replaced by a hand-rolled `fail("NOT_FOUND", …)` and only
       the now-unused import remained — a guard that green-lights the defect it
       exists to catch. Verified by reintroducing exactly that. */
    const src = readFileSync(join(ROOT, rel), "utf8").replace(/^import[\s\S]*?;$/gm, " ");
    assert.match(
      src,
      /classifyCartError[<(]/,
      `${rel} imports the shared classifier but no longer calls it`
    );
    assert.ok(
      !/errorMsg\.startsWith\("OUT_OF_STOCK"\)/.test(src),
      `${rel} has grown its own copy of the stock-refusal parsing`
    );
  }
});
