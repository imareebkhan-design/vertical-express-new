"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/validators";
import type { CheckoutTotals } from "@/lib/services/checkout";

/** Everything the server's quote depends on that the customer can change on the page. */
export interface QuoteInputs {
  addressId: string | null;
  pincode: string | null;
  couponCode: string | null;
  wantsExpress: boolean;
  /**
   * The cart's contents (variant × quantity), so a changed cart is re-quoted
   * (E8: items merged at sign-in, changed in another tab, clamped to stock). Not
   * sent — the server prices the cart it holds — only part of what makes a quote
   * current. Absent means the caller does not track it.
   */
  cartKey?: string;
}

export type FetchQuote = (
  pincode: string,
  couponCode: string | undefined,
  wantsExpress: boolean
) => Promise<ActionResult<CheckoutTotals>>;

export const QUOTE_FAILED =
  "We couldn't update your total. Check your connection and reload the page to try again — nothing has been placed.";

/** Shown if "place order" is pressed without a current quote (the button is off then; this covers a forced press). */
export const QUOTE_NOT_CURRENT = "Your total is being updated. Place the order once it shows.";

export type QuoteStatus = "idle" | "loading" | "ready" | "failed";

export interface CheckoutQuote {
  /** The server's totals — only when they answer exactly the current inputs; otherwise null. */
  quote: CheckoutTotals | null;
  status: QuoteStatus;
  /** Why the quote for the current inputs could not be had; null unless `status` is "failed". */
  failure: string | null;
  /** True only when `quote` is current and the server says it can be delivered. */
  canSubmit: boolean;
}

const keyOf = (i: QuoteInputs) => JSON.stringify([i.addressId, i.pincode, i.couponCode, i.wantsExpress, i.cartKey ?? null]);

/** `QuoteInputs.cartKey` for a cart's lines. */
export const cartKeyOf = (lines: readonly { variantId: string; qty: number }[]) =>
  lines.map((l) => `${l.variantId}:${l.qty}`).join(",");

/**
 * The checkout quote, shared by the desktop and phone checkouts (ISS-081).
 *
 * Both used to keep the previous totals while a new address, coupon or delivery
 * choice was re-quoted, so the total on screen — and an enabled "place order" —
 * belonged to inputs the customer had already changed. A COD order could be
 * placed at a figure never shown (the server charges its own recomputation).
 *
 * Here every change of inputs starts a new generation, in the same render —
 * before any request is made — and only the answer to the current generation's
 * request is current. So there is never a moment when an old total can be
 * placed against the new choice; a slow answer for an address the customer has
 * left cannot overwrite the answer for the one they chose; and going back to an
 * earlier address asks again rather than reusing its old answer (or its old
 * failure). Server actions reach the server one at a time, so answers arrive in
 * the order asked — but the customer can change their mind before they do. The
 * server still prices the order at placement; this only decides what may be
 * shown and submitted.
 *
 * `fetchQuote` is the `getCheckoutTotals` server action, passed in so the rules
 * above can be tested without a server. `onQuote` runs once per accepted quote,
 * with the inputs it answered.
 */
export function useCheckoutQuote(
  inputs: QuoteInputs,
  fetchQuote: FetchQuote,
  onQuote?: (totals: CheckoutTotals, answered: QuoteInputs) => void
): CheckoutQuote {
  const key = keyOf(inputs);
  /* New inputs → a new generation, set during this render so nothing below
     ever pairs the new inputs with the previous generation's answer. */
  const [generation, setGeneration] = useState({ key, n: 0 });
  if (generation.key !== key) setGeneration({ key, n: generation.n + 1 });
  const [answer, setAnswer] = useState<{ n: number; totals: CheckoutTotals } | null>(null);
  const [failed, setFailed] = useState<{ n: number; message: string } | null>(null);
  const latest = useRef(-1);
  const onQuoteRef = useRef(onQuote);
  useEffect(() => {
    onQuoteRef.current = onQuote;
  });

  const n = generation.n;
  useEffect(() => {
    if (!inputs.pincode) return;
    latest.current = n;
    const asked = { ...inputs };
    fetchQuote(asked.pincode!, asked.couponCode ?? undefined, asked.wantsExpress)
      .then((res) => {
        if (n !== latest.current) return;
        if (res.ok) {
          setAnswer({ n, totals: res.data });
          onQuoteRef.current?.(res.data, asked);
        } else {
          setFailed({ n, message: res.error.message });
        }
      })
      .catch(() => {
        if (n === latest.current) setFailed({ n, message: QUOTE_FAILED });
      });
    /* One request per generation; the inputs are those of this generation. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  const settled = generation.key === key;
  const quote = settled && answer?.n === n ? answer.totals : null;
  const failure = settled && !quote && failed?.n === n ? failed.message : null;
  const status: QuoteStatus = !inputs.pincode ? "idle" : quote ? "ready" : failure ? "failed" : "loading";
  return { quote, status, failure, canSubmit: quote !== null && quote.serviceable };
}
