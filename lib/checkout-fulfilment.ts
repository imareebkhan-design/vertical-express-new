/**
 * Whether the warehouse serving the chosen address can supply the cart, as the
 * quote reports it (`unavailableLines`). Shared by the desktop and mobile-web
 * checkouts so both refuse the same thing in the same words.
 *
 * Null while there is no quote, or the pincode is not served (that has its own
 * "not serviceable" message), or every line is in stock.
 */
export function unavailableMessage(
  totals: { serviceable: boolean; unavailableLines: string[] } | null | undefined,
  pincode: string | null | undefined
): string | null {
  if (!totals || !totals.serviceable || totals.unavailableLines.length === 0) return null;
  return `${totals.unavailableLines.join(", ")} isn't in stock for delivery to ${pincode ?? "this address"}. Choose another address.`;
}
