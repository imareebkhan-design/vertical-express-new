import { formatPaise } from "@/lib/money";
import type { CouponRevision } from "@/lib/coupon-refusal";

/**
 * Shown when a coupon the customer applied stopped qualifying — at placement
 * (the order was refused) or on a re-quote. Shared by the desktop and phone
 * checkouts so both say the same thing.
 *
 * It states the new total from the server's fresh quote beside the total the
 * customer saw with the coupon, so a higher price is never a surprise; and it
 * places nothing — the customer presses "place order" again if they accept it.
 */
export function CouponRevisedNotice({
  revision,
  currentTotalPaise,
  variant,
}: {
  revision: CouponRevision;
  /** The fresh server quote without the coupon; null while it loads. */
  currentTotalPaise: number | null;
  variant: "desktop" | "phone";
}) {
  const changed =
    revision.previousTotalPaise !== null &&
    currentTotalPaise !== null &&
    revision.previousTotalPaise !== currentTotalPaise;
  return (
    <div
      role="alert"
      className={
        variant === "phone"
          ? "rounded-[14px] border border-ink/15 bg-ink/5 p-3 text-xs font-semibold text-ink"
          : "rounded-panel border border-danger/30 bg-danger/5 p-3 text-sm font-semibold text-ink"
      }
    >
      <p>{revision.message}</p>
      {currentTotalPaise === null ? (
        <p className="mt-1">Updating your total…</p>
      ) : changed ? (
        <p className="mt-1">
          Total was <s>{formatPaise(revision.previousTotalPaise!)}</s> — now{" "}
          <strong>{formatPaise(currentTotalPaise)}</strong>.
        </p>
      ) : (
        <p className="mt-1">
          Total now <strong>{formatPaise(currentTotalPaise)}</strong>.
        </p>
      )}
      {revision.kind === "placement" && <p className="mt-1">Nothing has been charged.</p>}
    </div>
  );
}
