import { formatPaise } from "@/lib/money";
import type { ExpressOption } from "@/lib/services/express-delivery";

interface ExpressChoiceProps {
  /** The server's answer for this basket and pincode (`totals.express`). */
  express: ExpressOption;
  wantsExpress: boolean;
  onChange: (wantsExpress: boolean) => void;
  /** Lines in the basket — for "2 of 5 items can go on the express run". */
  lineCount: number;
  /**
   * How many shipments the basket makes without express (`groupCartByShipment`).
   * Heavy goods go by truck whatever is chosen, so "everything together" is only
   * said when standard really is one delivery (E7). Both checkouts pass it;
   * absent reads as one delivery, the wording before E7.
   */
  standardShipments?: number;
}

/**
 * "How fast" — the express choice, for the desktop and phone-web checkouts.
 *
 * `resolveExpressOption` decides; this asks. The rule is the owner's: express is
 * charged, a cart mixing an eligible item with one that is not can go standard
 * together at no extra charge, and standard is the fallback. Every "why not"
 * the service can return is rendered as itself rather than collapsed into a
 * disabled control with no explanation.
 *
 * Lifted out of the desktop checkout unchanged (W-B1-G1) so the phone, which
 * had no express choice at all, asks the same question in the same words.
 */
export function ExpressChoice({ express, wantsExpress, onChange, lineCount, standardShipments = 1 }: ExpressChoiceProps) {
  const oneDelivery = standardShipments <= 1;
  if (!express.available) {
    return (
      <p className="text-[13px] font-medium leading-[18.5px] text-ink-700">
        {express.reason === "no_price"
          ? "Express delivery is not being offered yet — the charge for it has not been set."
          : express.reason === "not_serviceable"
            ? "We do not deliver to this pincode."
            : "Nothing in this basket is set up for express delivery to this pincode. It goes on the standard run."}
      </p>
    );
  }

  return (
    <div role="radiogroup" aria-label="Delivery speed" className="space-y-2">
      <label className="flex cursor-pointer items-start gap-2.5 rounded-[20px] border border-line bg-canvas p-4">
        <input
          type="radio"
          name="delivery-speed"
          checked={!wantsExpress}
          onChange={() => onChange(false)}
          className="mt-0.5 size-4 shrink-0 accent-ink"
        />
        <span>
          <span className="block text-[13.5px] font-bold text-ink">
            {oneDelivery ? "Standard · everything together" : "Standard"}
          </span>
          <span className="mt-0.5 block text-[12.5px] font-medium leading-[17px] text-ink-700">
            No extra charge.
            {express.reason === "mixed_cart"
              ? oneDelivery
                ? " Some of this basket can’t go on the express run, so choosing standard keeps the order in one delivery."
                : " Some of this basket can’t go on the express run."
              : ""}
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-[20px] border border-line bg-canvas p-4">
        <input
          type="radio"
          name="delivery-speed"
          checked={wantsExpress}
          onChange={() => onChange(true)}
          className="mt-0.5 size-4 shrink-0 accent-ink"
        />
        <span>
          <span className="block text-[13.5px] font-bold text-ink">
            Express delivery · {express.feePaise !== null ? formatPaise(express.feePaise) : "—"}
          </span>
          <span className="mt-0.5 block text-[12.5px] font-medium leading-[17px] text-ink-700">
            {express.reason === "mixed_cart"
              ? `${express.eligibleVariantIds.length} of ${lineCount} items can go on the express run. The rest follow separately.`
              : "Everything in this basket can go on the express run."}
          </span>
        </span>
      </label>
    </div>
  );
}
