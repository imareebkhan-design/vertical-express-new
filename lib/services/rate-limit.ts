import "server-only";
import { db } from "@/lib/db";

export type RateLimitOptions = {
  /**
   * What to do when the limiter itself fails — the table is unreachable, the
   * pool is exhausted, the query errors.
   *
   * Default `false` (fail open): never block a legitimate user because our
   * limiter broke. Correct for search and serviceability, where the cost of a
   * limiter outage is some extra load.
   *
   * `true` (fail closed) is for buckets where exceeding the limit spends money
   * or harms a third party. The OTP bucket sets it — see DEC-016: "Rate
   * limiting on the OTP endpoint should fail closed rather than open (ISS-021)."
   * A limiter outage there means a victim can be OTP-bombed and we pay for
   * every message.
   */
  failClosed?: boolean;
};

type RateLimitRow = { hits: number; retry_after_ms: number };

/**
 * DB-backed fixed-window rate limiter. Works across serverless instances
 * (unlike in-memory) with no extra infra.
 *
 * The window is claimed, reset and incremented in a SINGLE statement (ISS-027).
 * It previously read with `findUnique` and then wrote with `update`, which is a
 * read-modify-write race: two concurrent requests both read `hits: 4`, both saw
 * themselves as under a limit of 5, and both proceeded — so the limiter leaked
 * exactly when it was under the burst it exists to stop. `INSERT ... ON CONFLICT
 * DO UPDATE ... RETURNING` makes the read and the write the same operation, and
 * concurrent callers serialise on the row lock.
 *
 * Every call increments, including a denied one, so `hits` counts attempts
 * rather than successes. `windowStart` is pinned for the life of the window, so
 * `retryAfterMs` stays stable as attempts continue.
 *
 * @param bucket   stable key, e.g. `otp:+919000000000`
 * @param limit    max hits per window
 * @param windowMs window length in ms
 */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowMs: number,
  options: RateLimitOptions = {}
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  try {
    /**
     * All time arithmetic happens in the database, in one clock domain.
     *
     * `window_start` is `TIMESTAMP(3)` — no time zone. Passing a JavaScript
     * `Date` in and reading one back out crosses two different timezone
     * assumptions: the driver writes the naked local timestamp, and the client
     * reads it back as UTC. On an IST machine that skewed the window by 5h30m,
     * which both corrupts `retryAfterMs` and makes an active window look long
     * expired — so the limiter would reset on nearly every call.
     *
     * `LOCALTIMESTAMP` matches the column type exactly and is stable for the
     * whole statement, so the reset comparison, the stored value and the
     * returned remainder are all measured against the same instant.
     */
    const rows = await db.$queryRaw<RateLimitRow[]>`
      INSERT INTO "rate_limits" ("id", "bucket", "hits", "window_start")
      VALUES (gen_random_uuid(), ${bucket}, 1, LOCALTIMESTAMP)
      ON CONFLICT ("bucket") DO UPDATE
      SET "hits" = CASE
            WHEN "rate_limits"."window_start"
                 < LOCALTIMESTAMP - (${windowMs}::int * interval '1 millisecond')
            THEN 1
            ELSE "rate_limits"."hits" + 1
          END,
          "window_start" = CASE
            WHEN "rate_limits"."window_start"
                 < LOCALTIMESTAMP - (${windowMs}::int * interval '1 millisecond')
            THEN LOCALTIMESTAMP
            ELSE "rate_limits"."window_start"
          END
      RETURNING
        "hits",
        GREATEST(0, EXTRACT(EPOCH FROM (
          "window_start" + (${windowMs}::int * interval '1 millisecond') - LOCALTIMESTAMP
        )) * 1000)::int AS retry_after_ms
    `;

    const row = rows[0];
    if (!row) {
      // RETURNING on an upsert always yields a row; treat its absence as a
      // limiter failure rather than silently allowing.
      return denied(options, windowMs);
    }

    if (row.hits > limit) {
      return { allowed: false, retryAfterMs: row.retry_after_ms };
    }

    return { allowed: true, retryAfterMs: 0 };
  } catch {
    return denied(options, windowMs);
  }
}

/**
 * The limiter could not reach a verdict. Fail open or closed per the bucket's
 * configuration. Deliberately swallows the underlying error: it may carry the
 * connection string, and this value reaches a user-facing message.
 */
function denied(
  options: RateLimitOptions,
  windowMs: number
): { allowed: boolean; retryAfterMs: number } {
  if (!options.failClosed) return { allowed: true, retryAfterMs: 0 };
  return { allowed: false, retryAfterMs: windowMs };
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
