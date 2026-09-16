import { fail, type ActionResult } from "@/lib/validators";

/**
 * Turning a cart service throw into a result the caller can render.
 *
 * WHY THIS IS ITS OWN FILE
 *
 * `lib/services/cart.ts` signals two business refusals by throwing a string:
 * `OUT_OF_STOCK:…` and `ONLY_X_LEFT:…`. Everything else it throws is a fault.
 * Deciding which is which — and pulling the numbers back out of the message —
 * was written once, inline, in `addToCart`.
 *
 * The HTTP endpoint at `/api/v1/cart/items` performs the same operation for the
 * native app and needs the same answer. Copying the block would give the two
 * surfaces the same rules until the first time somebody fixed one of them, and
 * the class of bug that produces is the one this repository has already paid
 * for twice: the mobile checkout view that applied a coupon and placed the
 * order without it, and the six call sites left on Supabase after the Firebase
 * migration. So the classification lives in one pure function that both import.
 *
 * Pure on purpose: no database, no `server-only`, no Next.js. It can therefore
 * be tested directly, and a future shared package can take it as-is.
 */

/** The shape the UI reads to decide between "unavailable" and "only N left". */
export interface CartStockAdjustment {
  status: "out_of_stock" | "limited";
  available: number;
  requested: number;
  message: string;
}

const STOCK_CODES = ["OUT_OF_STOCK", "ONLY_X_LEFT"] as const;
type StockCode = (typeof STOCK_CODES)[number];

/**
 * Classify a throw from `addItem`.
 *
 * Returns a `fail()` in every case — the caller has already decided this is the
 * error path. A refusal the customer can act on keeps its own code and carries
 * the numbers in `metadata`; anything else becomes NOT_FOUND, because from the
 * customer's side an item that cannot be added for a reason we cannot name is
 * indistinguishable from one that is not there.
 *
 * `requestedQty` is the quantity the caller asked for, used only when the
 * message does not carry one of its own.
 */
export function classifyCartError<T>(error: unknown, requestedQty: number): ActionResult<T> {
  const raw = error instanceof Error ? error.message : "";
  const separator = raw.indexOf(":");
  const prefix = separator === -1 ? raw : raw.slice(0, separator);

  if (!STOCK_CODES.includes(prefix as StockCode)) {
    return fail("NOT_FOUND", "This product is unavailable");
  }

  const code = prefix as StockCode;

  /* `slice`, not `split(":")[1]`. The service writes
   *   "ONLY_X_LEFT:Only 5 items are available. Requested: 8"
   * which contains a second colon, so splitting truncated the sentence at
   * "…are available. Requested" and the customer read a message that stopped
   * mid-clause. It also meant the /Requested: (\d+)/ match below could never
   * fire, which is the evidence that a whole message was what was intended. */
  const message = (separator === -1 ? "" : raw.slice(separator + 1).trim()) || "Not enough stock";

  let available = 0;
  let requested = requestedQty;

  if (code === "ONLY_X_LEFT") {
    const availableMatch = message.match(/Only (\d+) items/i);
    if (availableMatch) available = parseInt(availableMatch[1], 10);
    const requestedMatch = message.match(/Requested: (\d+)/i);
    if (requestedMatch) requested = parseInt(requestedMatch[1], 10);
  }

  const adjustment: CartStockAdjustment = {
    status: code === "OUT_OF_STOCK" ? "out_of_stock" : "limited",
    available,
    requested,
    message,
  };

  return fail(code, message, undefined, adjustment);
}
