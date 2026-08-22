import { z } from "zod";

export const pincodeSchema = z
  .string()
  .regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode");

export const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number");

export const addressInputSchema = z.object({
  label: z.enum(["home", "site", "office", "other"]).default("home"),
  name: z.string().min(2, "Name is required").max(80),
  phone: phoneSchema,
  line1: z.string().min(3, "Address line is required").max(160),
  line2: z.string().max(160).optional().or(z.literal("")),
  landmark: z.string().max(120).optional().or(z.literal("")),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  pincode: pincodeSchema,
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressInputSchema>;

export const cartItemInputSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().min(1).max(999),
});

/** Uniform result envelope for server actions. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ActionErrorCode; message: string; field?: string; metadata?: unknown } };

export type ActionErrorCode =
  | "UNAUTHENTICATED" |"FORBIDDEN" |"NOT_FOUND" |"VALIDATION" |"OUT_OF_STOCK" |"ONLY_X_LEFT" |"PINCODE_UNSERVICEABLE" |"COUPON_INVALID" |"PAYMENT_FAILED" |"RATE_LIMITED" |"CONFLICT";

export function fail<T>(code: ActionErrorCode, message: string, field?: string, metadata?: unknown): ActionResult<T> {
  return { ok: false, error: { code, message, field, metadata } };
}

export function succeed<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}
