import "server-only";
import { db } from "@/lib/db";

/**
 * DB-backed fixed-window rate limiter (P1-4). Works across serverless instances
 * (unlike in-memory) with no extra infra. Returns whether the action is allowed.
 *
 * @param bucket  stable key, e.g. `otp:user@example.com`
 * @param limit   max hits per window
 * @param windowMs window length in ms
 */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const now = new Date();
  const windowAgo = new Date(now.getTime() - windowMs);

  try {
    // Reset the window if it has expired, then atomically increment.
    const existing = await db.rateLimit.findUnique({ where: { bucket } });

    if (!existing || existing.windowStart < windowAgo) {
      await db.rateLimit.upsert({
        where: { bucket },
        update: { hits: 1, windowStart: now },
        create: { bucket, hits: 1, windowStart: now },
      });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (existing.hits >= limit) {
      const retryAfterMs = existing.windowStart.getTime() + windowMs - now.getTime();
      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    await db.rateLimit.update({ where: { bucket }, data: { hits: { increment: 1 } } });
    return { allowed: true, retryAfterMs: 0 };
  } catch {
    // Fail open on limiter errors — never block a legitimate user because the
    // limiter table is unreachable.
    return { allowed: true, retryAfterMs: 0 };
  }
}

/**
 * Safely extracts client IP address from incoming request headers.
 * Prioritizes `x-real-ip` (set by edge proxies like Vercel/Nginx) before
 * parsing `x-forwarded-for` to prevent header spoofing.
 */
export function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  return "anonymous";
}
