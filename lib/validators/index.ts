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
  /** What the driver needs to know at the gate. The column has always
   *  existed; nothing could send it until the app asked for it. */
  accessNote: z.string().max(240).optional().or(z.literal("")),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  pincode: pincodeSchema,
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  isDefault: z.boolean().default(false),
}).refine((a) => (a.latitude == null) === (a.longitude == null), { message: "Both delivery coordinates are required", path: ["latitude"] });
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
  | "UNAUTHENTICATED" |"FORBIDDEN" |"NOT_FOUND" |"VALIDATION" |"OUT_OF_STOCK" |"ONLY_X_LEFT" |"PINCODE_UNSERVICEABLE" |"COUPON_INVALID" |"PAYMENT_FAILED" |"RATE_LIMITED" |"CONFLICT" |"UNAVAILABLE";

export function fail<T>(code: ActionErrorCode, message: string, field?: string, metadata?: unknown): ActionResult<T> {
  return { ok: false, error: { code, message, field, metadata } };
}

export function succeed<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}
