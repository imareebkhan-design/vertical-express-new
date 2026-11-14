/**
 * The address a request came from, for rate limiting — read from what the
 * platform wrote, never from what the caller sent.
 *
 * `x-forwarded-for` is a list the caller starts and every proxy appends to.
 * Google's load balancer appends two entries: the address that connected to
 * it, then its own (cloud.google.com/load-balancing/docs/https, "X-Forwarded-For
 * header"). So the caller controls every entry EXCEPT the last ones. The old
 * reader took `x-real-ip`, then the FIRST entry — both caller-supplied here:
 * on staging, 13 Nov 2026, a request sending `x-real-ip: 203.0.113.8` was
 * limited under 203.0.113.8, and one sending `x-forwarded-for: 203.0.113.77`
 * under that; with neither header the first entry was the true address, which
 * shows the platform sets no `x-real-ip` and appends rather than replaces.
 * Rotating a header gave a fresh bucket on every per-address limit.
 *
 * `TRUSTED_PROXY_HOPS` is how many entries the platform appends AFTER the
 * client's (default 1: the load balancer's own). It must match the deployment:
 * too low and everyone shares the proxy's bucket; too high and the caller
 * chooses the bucket again. Check it after a staging rollout before production
 * (docs/DEPLOY_FIREBASE.md, "Client address").
 *
 * Pure and dependency-free so the rule is tested directly.
 */
export type HeaderReader = { get(name: string): string | null };

export function trustedProxyHops(env: Record<string, string | undefined> = process.env): number {
  const raw = env.TRUSTED_PROXY_HOPS;
  if (raw === undefined || raw === "") return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 1;
}

export function clientAddress(headers: HeaderReader, hops: number = trustedProxyHops()): string {
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (!entries.length) return "anonymous";
  /* Counted from the right. A list shorter than expected did not come through
     the platform (local development, a test): its last entry is the peer. */
  const index = entries.length - 1 - hops;
  const picked = entries[index >= 0 ? index : entries.length - 1];
  /* A bucket key: bounded, and nothing but address characters. */
  return /^[0-9A-Fa-f:.]{2,45}$/.test(picked) ? picked.toLowerCase() : "anonymous";
}
