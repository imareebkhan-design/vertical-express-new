/** Browser session mutations require an explicit same-origin request (ISS-109).
 * Firebase App Hosting forwards the external host/protocol while the container
 * URL can be internal. These headers must be supplied by the trusted ingress.
 * Reject ambiguous lists instead of selecting an attacker-controlled element.
 */
export function sessionRequestRefusal(request: Request): 403 | 415 | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1);
  if (!origin || !host || host.includes(",") || !["https", "http"].includes(protocol)) return 403;
  if (request.headers.get("sec-fetch-site") === "cross-site") return 403;
  try {
    const source = new URL(origin);
    const target = new URL(`${protocol}://${host}`);
    if (source.origin === "null" || source.origin !== origin || source.origin !== target.origin) return 403;
  } catch {
    return 403;
  }
  if (request.method === "POST" && request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return 415;
  return null;
}
