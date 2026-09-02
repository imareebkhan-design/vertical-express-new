import { adminListCoupons } from "@/lib/services/admin/coupons";
import { CouponsManager } from "@/components/admin/coupons-manager";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdminCoupons() {
  const coupons = await adminListCoupons();
  const now = new Date();
  const live = coupons.filter(
    (c) =>
      c.isActive &&
      !(c.endsAt && c.endsAt < now) &&
      !(c.startsAt && c.startsAt > now) &&
      !(c.usageLimit !== null && c.redeemed >= c.usageLimit)
  ).length;
  const givenAway = coupons.reduce((s, c) => s + c.discountedPaise, 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Coupons</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
          {live} live of {coupons.length}
          {givenAway > 0 && <> · {formatPaise(givenAway)} discounted so far</>}
        </p>
      </div>

      {/*
        The screen used to carry a warning that the coupon engine was dead code
        and these discounts were "configured intent, not what a customer is
        actually charged". That was true when it was written and is not now:
        ISS-011 wired the engine, and ISS-066 made the usage, per-customer and
        first-N-orders limits actually bind. Leaving a stale warning up is its
        own kind of wrong — it teaches whoever reads it to distrust a screen
        that has become correct.
      */}
      <CouponsManager coupons={coupons} />
    </div>
  );
}
