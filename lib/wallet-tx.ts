/**
 * Which wallet transactions add money and which take it away.
 *
 * The direction lives in `WalletTransaction.type`, and reading it any other way
 * has already gone wrong twice:
 *
 *   The mobile wallet asked `t.type === "credit"`. No such value exists — the
 *   enum is cashback_credit | order_debit | refund_credit | expired — so the
 *   comparison was false for every row ever written. Every transaction rendered
 *   with a down arrow, the label "Used on an order" and a leading minus, so a
 *   ₹500 refund credited to a customer's wallet read as ₹500 taken out of it.
 *
 *   The desktop wallet asked `amountPaise > 0`. That happens to be right today
 *   only because the single writer (`creditCashbackForOrder`) stores a positive
 *   amount and no debit is ever written. The sign is a storage detail; the type
 *   is the meaning.
 *
 * Pure and client-safe on purpose: both wallet views render in the browser.
 */
export const WALLET_CREDIT_TYPES = ["cashback_credit", "refund_credit"] as const;

/** True when the transaction added money to the wallet. */
export function isWalletCredit(type: string): boolean {
  return (WALLET_CREDIT_TYPES as readonly string[]).includes(type);
}
