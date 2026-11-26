import "server-only";
import { rateLimit } from "@/lib/services/rate-limit";

/** Abuse controls, not a customer booking entitlement. Address is checked first
 * so a blocked sender cannot keep consuming other customers' phone quotas or
 * the shared ceiling. All instances share the atomic database limiter.
 */
export async function bookingBudget(
  ip: string,
  phone: string,
  limit: typeof rateLimit = rateLimit
): Promise<boolean> {
  const options = { failClosed: true };
  if (!(await limit(`booking-ip:${ip}`, 5, 3_600_000, options)).allowed) return false;
  if (!(await limit(`booking:${phone}`, 5, 3_600_000, options)).allowed) return false;
  return (await limit("booking-global:day", 1_000, 86_400_000, options)).allowed;
}
