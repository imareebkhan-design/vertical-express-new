"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import { getAdminUser } from "@/lib/services/admin/authz";
import { parseRupeeInput } from "@/lib/money";
import { type ActionResult, fail, succeed } from "@/lib/validators";

/**
 * Creating and editing coupons from the console.
 *
 * A coupon is money leaving the business on terms somebody chose, so the form
 * fields are the owner's decisions and none of them is defaulted to something
 * generous. What this code is responsible for is that the number typed is the
 * number stored, and that the terms shown on the screen are the terms the
 * checkout will actually apply.
 *
 * Money arrives as strings and goes through parseRupeeInput, which refuses
 * anything that is not a plain rupee amount rather than coercing it. `Number()`
 * on a money field turns an empty string into zero and "1e3" into a thousand
 * rupees, and both of those ship as a working coupon.
 *
 * Create and edit are separate, for the reason they had to be separated on
 * brands: an upsert keyed on the code means adding a coupon whose code already
 * exists silently rewrites the terms of the live one instead of refusing.
 *
 * Nothing here deletes. Orders carry `couponCode` as a string, and a deleted
 * coupon turns every order that used it into a discount with no explanation.
 * Pausing is the retirement.
 */
const schema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "A coupon code needs at least three characters")
      .max(24)
      .regex(/^[A-Z0-9][A-Z0-9-]*$/, "Use capitals, digits and hyphens only"),
    type: z.enum(["percent", "flat", "free_delivery"]),
    /** Percent for `percent`; a rupee string for `flat`; ignored otherwise. */
    value: z.string().trim(),
    minOrder: z.string().trim(),
    maxDiscount: z.string().trim(),
    usageLimit: z.string().trim(),
    perUserLimit: z.string().trim(),
    firstNOrders: z.string().trim(),
    startsAt: z.string().trim(),
    endsAt: z.string().trim(),
    isActive: z.boolean(),
    /** Present when editing. Absent means create. */
    originalCode: z.string().trim().optional(),
  })
  .superRefine((v, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", message });

    if (v.type === "percent") {
      const n = Number(v.value);
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        bad("A percentage discount must be a whole number between 1 and 100");
      }
    } else if (v.type === "flat") {
      if (parseRupeeInput(v.value) === null) bad("Enter the discount as a rupee amount");
      else if (parseRupeeInput(v.value)! <= 0) bad("A flat discount must be more than zero");
    }

    if (v.minOrder !== "" && parseRupeeInput(v.minOrder) === null) {
      bad("The minimum order is not a valid amount");
    }
    if (v.maxDiscount !== "" && parseRupeeInput(v.maxDiscount) === null) {
      bad("The maximum discount is not a valid amount");
    }
    for (const [field, label] of [
      ["usageLimit", "The total usage limit"],
      ["perUserLimit", "The per-customer limit"],
      ["firstNOrders", "The first-N-orders limit"],
    ] as const) {
      const raw = v[field];
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1) bad(`${label} must be a whole number of at least 1`);
    }

    if (v.startsAt && v.endsAt && new Date(v.startsAt) > new Date(v.endsAt)) {
      bad("The coupon ends before it starts");
    }
  });

const asDate = (s: string): Date | null => (s ? new Date(s) : null);
const asInt = (s: string): number | null => (s === "" ? null : Number(s));

export async function adminSaveCoupon(input: unknown): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Those terms are not valid");
  }
  const v = parsed.data;

  const data = {
    code: v.code,
    type: v.type,
    /* For a percentage the value IS the percentage; for a flat discount it is
       paise. Storing rupees in one and a percent in the other is the mistake
       this column invites, so the conversion happens exactly here. */
    value: v.type === "percent" ? Number(v.value) : v.type === "flat" ? parseRupeeInput(v.value)! : 0,
    minOrderPaise: v.minOrder === "" ? 0 : parseRupeeInput(v.minOrder)!,
    /* Only meaningful for a percentage — a cap on a flat discount is the flat
       discount, and storing one would be a second number to keep in step. */
    maxDiscountPaise: v.type === "percent" && v.maxDiscount !== "" ? parseRupeeInput(v.maxDiscount)! : null,
    usageLimit: asInt(v.usageLimit),
    perUserLimit: asInt(v.perUserLimit) ?? 1,
    firstNOrders: asInt(v.firstNOrders),
    startsAt: asDate(v.startsAt),
    endsAt: asDate(v.endsAt),
    isActive: v.isActive,
  };

  /* A coupon is money leaving the business, and its terms are exactly what an
     argument three months later is about: what the discount was, what the cap
     was, how many times it could be used, and who set it there.

     The row itself is not that record — an edit overwrites it, so the terms an
     order was placed under are gone the moment somebody changes them. The only
     trace was a stdout log line, and with no Sentry DSN configured (ISS-012)
     those are Vercel runtime logs that age out.

     The audit row goes in the same transaction as the write, so a coupon whose
     terms changed without a record is not a state this can reach. */
  try {
    await db.$transaction(async (tx) => {
      if (v.originalCode) {
        const existing = await tx.coupon.findUnique({
          where: { code: v.originalCode },
        });
        if (!existing) throw new Error("COUPON_GONE");
        await tx.coupon.update({ where: { code: v.originalCode }, data });
        await recordAudit(tx, {
          actorType: "admin",
          actorId: admin.id,
          action: "coupon.edited",
          entityType: "coupon",
          entityId: v.code,
          before: {
            code: existing.code,
            type: existing.type,
            value: existing.value,
            minOrderPaise: existing.minOrderPaise,
            maxDiscountPaise: existing.maxDiscountPaise,
            usageLimit: existing.usageLimit,
            perUserLimit: existing.perUserLimit,
            firstNOrders: existing.firstNOrders,
            isActive: existing.isActive,
          },
          after: { ...data, startsAt: null, endsAt: null },
        });
      } else {
        await tx.coupon.create({ data });
        await recordAudit(tx, {
          actorType: "admin",
          actorId: admin.id,
          action: "coupon.created",
          entityType: "coupon",
          entityId: v.code,
          after: { ...data, startsAt: null, endsAt: null },
        });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "COUPON_GONE") {
      return fail("NOT_FOUND", "That coupon no longer exists");
    }
    return fail("CONFLICT", "A coupon with that code already exists");
  }

  revalidatePath("/admin/coupons");
  return succeed(null);
}

/**
 * Pausing or resuming a coupon. Never deleting: orders reference the code as a
 * string, and removing it turns every order that used it into a discount with
 * no explanation.
 */
export async function adminSetCouponActive(
  code: string,
  isActive: boolean
): Promise<ActionResult<null>> {
  const admin = await getAdminUser();
  if (!admin) return fail("FORBIDDEN", "Admin access required");

  /* Same transaction as the pause. "Nobody knows who turned the discount back
     on" is the question this exists to answer. The updateMany guard on
     isActive makes the write idempotent: a second click changes no rows and
     writes no audit row, so the trail records changes rather than clicks. */
  const changed = await db.$transaction(async (tx) => {
    const updated = await tx.coupon.updateMany({
      where: { code, isActive: !isActive },
      data: { isActive },
    });
    if (updated.count === 0) return false;
    await recordAudit(tx, {
      actorType: "admin",
      actorId: admin.id,
      action: isActive ? "coupon.resumed" : "coupon.paused",
      entityType: "coupon",
      entityId: code,
      before: { isActive: !isActive },
      after: { isActive },
    });
    return true;
  });

  if (!changed) {
    /* Either the coupon is gone or it was already in that state. Distinguish
       them so a missing coupon is not reported as a successful no-op. */
    const exists = await db.coupon.findUnique({ where: { code }, select: { code: true } });
    if (!exists) return fail("NOT_FOUND", "That coupon no longer exists");
  }

  revalidatePath("/admin/coupons");
  return succeed(null);
}
