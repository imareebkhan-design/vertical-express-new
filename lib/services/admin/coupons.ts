import "server-only";
import { db } from "@/lib/db";

/**
 * Coupons for the operations console, each with what it has actually cost.
 *
 * The old list showed a usage limit beside no usage. That is the least useful
 * shape a promotions screen can take — the question anybody opens it to answer
 * is "is this one working, and what has it given away", and neither figure was
 * there.
 *
 * Redemptions are counted the same way the eligibility rules count them, from
 * `Order.couponCode`, excluding cancelled orders. If the two ever disagreed the
 * screen would be lying about the limit it displays, so they read the same
 * source rather than approximating each other.
 */
export interface CouponRow {
  id: string;
  code: string;
  type: "percent" | "flat" | "free_delivery";
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  usageLimit: number | null;
  perUserLimit: number;
  firstNOrders: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  /** Orders that used it and were not cancelled. */
  redeemed: number;
  /** What it has actually discounted, in paise. */
  discountedPaise: number;
}

export async function adminListCoupons(): Promise<CouponRow[]> {
  const coupons = await db.coupon.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
  if (coupons.length === 0) return [];

  /* One grouped query rather than one per coupon — this screen is opened with
     every promotion the shop has ever run on it. */
  const usage = await db.order.groupBy({
    by: ["couponCode"],
    where: {
      couponCode: { in: coupons.map((c) => c.code) },
      status: { not: "cancelled" },
    },
    _count: { _all: true },
    _sum: { discountPaise: true },
  });

  const byCode = new Map(usage.map((u) => [u.couponCode, u]));

  return coupons.map((c) => {
    const u = byCode.get(c.code);
    return {
      id: c.id,
      code: c.code,
      type: c.type,
      value: c.value,
      minOrderPaise: c.minOrderPaise,
      maxDiscountPaise: c.maxDiscountPaise,
      usageLimit: c.usageLimit,
      perUserLimit: c.perUserLimit,
      firstNOrders: c.firstNOrders,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      isActive: c.isActive,
      redeemed: u?._count._all ?? 0,
      discountedPaise: u?._sum.discountPaise ?? 0,
    };
  });
}
