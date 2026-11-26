/**
 * Pure decision logic for scripts/staging-security-smoke.mjs, kept apart from
 * the network calls so it can be unit-tested (lib/__tests__/staging-smoke-checks.test.ts).
 */

/**
 * Hosts the smoke script may target. Staging-like labels or local only, so a
 * slip of the keyboard cannot point it at production.
 */
export function isAllowedSmokeHost(hostname) {
  return /(^|[.-])(staging|stg|preview|dev|test)([.-]|$)|^localhost$|^127\.0\.0\.1$/i.test(hostname);
}

/**
 * Outcome of the login-CSRF probe: a cross-site, preflight-free
 * `text/plain` POST to /api/auth/session carrying an invalid token.
 *
 *   403 / 415 → "pass": refused before the token is looked at (ISS-109 fixed).
 *   401       → "open": the handler parsed the body and verified the token.
 *               That is the known ISS-109 exposure — reported, never passed.
 *   anything else → "fail": the route is broken or behaves in a way nobody has
 *               assessed (a 200 would mean an invalid token made a session).
 */
export function classifyCsrfProbe(status) {
  if (status === 403 || status === 415) return { outcome: "pass", detail: `status ${status}: refused before token verification` };
  if (status === 401) {
    return { outcome: "open", detail: "status 401: handler reached and token verified — login CSRF still open (ISS-109)" };
  }
  return { outcome: "fail", detail: `status ${status}: unexpected response to the cross-site probe` };
}

/** The raw contents of every `<script type="application/ld+json">` block in a page. */
export function extractJsonLdBlocks(html) {
  return [...html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
}

/** Every node in a JSON-LD document, flattening `@graph` and top-level arrays. */
function nodesOf(doc) {
  if (Array.isArray(doc)) return doc.flatMap(nodesOf);
  if (doc && typeof doc === "object") {
    return Array.isArray(doc["@graph"]) ? [doc, ...doc["@graph"].flatMap(nodesOf)] : [doc];
  }
  return [];
}

function hasType(node, type) {
  const t = node["@type"];
  return t === type || (Array.isArray(t) && t.includes(type));
}

/**
 * Validates every structured-data block on a page. Each block must parse as
 * JSON and contain no raw `<` (the escape this PR adds). When `requiredType` is
 * given, at least one node of that type must exist and carry a non-empty `name`
 * — so a product page with only the site-level block fails instead of passing.
 */
export function validateJsonLd(html, requiredType) {
  const blocks = extractJsonLdBlocks(html);
  const problems = [];
  if (blocks.length === 0) problems.push("no structured data found");

  const nodes = [];
  blocks.forEach((raw, i) => {
    if (raw.includes("<")) problems.push(`block ${i + 1} contains a raw '<'`);
    try {
      nodes.push(...nodesOf(JSON.parse(raw)));
    } catch {
      problems.push(`block ${i + 1} is not valid JSON`);
    }
  });

  if (requiredType) {
    const matches = nodes.filter((n) => hasType(n, requiredType));
    if (matches.length === 0) problems.push(`no ${requiredType} node`);
    else if (!matches.some((n) => typeof n.name === "string" && n.name.trim() !== "")) {
      problems.push(`${requiredType} node has no name`);
    }
  }

  return { ok: problems.length === 0, blocks: blocks.length, problems };
}
