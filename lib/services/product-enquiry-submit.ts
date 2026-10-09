import "server-only";
import { z } from "zod";
import { phoneSchema } from "@/lib/validators";
import { rateLimit } from "@/lib/services/rate-limit";
import { createProductEnquiry } from "@/lib/services/product-enquiries";

/**
 * The one submission path for product enquiries — the web server action and
 * `/api/v1/products/[slug]/enquiry` both call it, so validation and abuse
 * limits cannot drift between web and app.
 *
 * Limits fail CLOSED: a limiter outage must not open a spam channel into the
 * admin queue. `website` is a honeypot field humans never see or fill.
 */
export const productEnquirySchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: phoneSchema,
  quantity: z.string().trim().max(80).optional().or(z.literal("")),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
  website: z.string().max(0).optional().or(z.literal("")),
});

export const ENQUIRY_LIMITS = {
  perPhone: { hits: 5, windowMs: 60 * 60 * 1000 },
  perIp: { hits: 20, windowMs: 60 * 60 * 1000 },
} as const;

export type SubmitEnquiryResult =
  | { ok: true; enquiryNo: string }
  | { ok: false; code: "VALIDATION" | "RATE_LIMITED" | "NOT_FOUND"; message: string; field?: string };

export async function submitProductEnquiry(
  input: unknown,
  ctx: { ip: string; userId: string | null }
): Promise<SubmitEnquiryResult> {
  const parsed = productEnquirySchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0]?.toString();
    /* A filled honeypot is a bot; answer like any validation failure. */
    return { ok: false, code: "VALIDATION", message: field === "website" ? "Could not send" : issue?.message ?? "Check the details", field };
  }
  const d = parsed.data;

  const [byPhone, byIp] = await Promise.all([
    rateLimit(`enquiry-phone:${d.phone}`, ENQUIRY_LIMITS.perPhone.hits, ENQUIRY_LIMITS.perPhone.windowMs, { failClosed: true }),
    rateLimit(`enquiry-ip:${ctx.ip}`, ENQUIRY_LIMITS.perIp.hits, ENQUIRY_LIMITS.perIp.windowMs, { failClosed: true }),
  ]);
  if (!byPhone.allowed || !byIp.allowed) {
    return { ok: false, code: "RATE_LIMITED", message: "Too many enquiries. Please try again later." };
  }

  const result = await createProductEnquiry({
    productId: d.productId,
    name: d.name,
    phone: d.phone,
    quantity: d.quantity,
    message: d.message,
    userId: ctx.userId,
  });
  if (!result.ok) return { ok: false, code: "NOT_FOUND", message: "This product is not available for enquiries" };
  return { ok: true, enquiryNo: result.enquiryNo };
}
