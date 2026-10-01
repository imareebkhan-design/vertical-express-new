import { Loader2 } from "lucide-react";
import { CouponRevisedNotice } from "@/components/shop/checkout/coupon-revised-notice";
import type { CouponRevision } from "@/lib/coupon-refusal";

/**
 * The phone Order Summary while there is no fresh quote to show — loading, or
 * the request for one failed. The bottom bar (amount and "place order") is
 * hidden then, so this card is where the customer looks for the reason.
 *
 * A failed re-quote after a refused coupon used to fall through to "Pincode
 * serviceability details unavailable." — untrue — while the real message sat
 * in the banner at the top of the page, scrolled out of sight, and the notice
 * saying the order was not placed lived in the hidden bottom bar (E6). It
 * shows no amount: none is current.
 */
export function QuotePending({
  loading,
  failure,
  revision,
}: {
  loading: boolean;
  /** Why the latest quote could not be had; null if it has not failed. */
  failure: string | null;
  /** A coupon that stopped qualifying, if that is why the quote is being redone. */
  revision: CouponRevision | null;
}) {
  if (failure && !loading) {
    return (
      <div role="alert" className="rounded-[14px] bg-danger/10 p-3 text-xs font-bold text-danger space-y-1">
        {revision && <p>{revision.message}</p>}
        <p>{failure}</p>
      </div>
    );
  }
  if (revision) return <CouponRevisedNotice revision={revision} currentTotalPaise={null} variant="phone" />;
  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 gap-2">
        <Loader2 className="size-4 animate-spin text-brand-deep" />
        <span className="text-xs font-semibold text-ink/50">Calculating totals...</span>
      </div>
    );
  }
  return <div className="text-center py-4 text-xs font-semibold text-ink/40">Pincode serviceability details unavailable.</div>;
}
