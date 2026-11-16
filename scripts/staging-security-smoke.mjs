#!/usr/bin/env node
/**
 * Read-only security smoke checks against a STAGING deployment (ISS-108).
 *
 *   node scripts/staging-security-smoke.mjs https://<staging-host> [product-slug]
 *
 * It sends no credentials and writes nothing: every request is either
 * unauthenticated or carries a deliberately invalid token, and every check
 * expects a refusal. The signed-in checks (session lifecycle, revocation,
 * image upload, test-mode checkout) need a real staging account and are a
 * manual runbook: docs/security/staging-smoke-iss-108.md.
 *
 * Refuses any host that does not look like a staging or local target, so it
 * cannot be pointed at production by accident.
 */

const base = process.argv[2];
const productSlug = process.argv[3];
if (!base) {
  console.error("usage: node scripts/staging-security-smoke.mjs <staging-base-url> [product-slug]");
  process.exit(2);
}
const target = new URL(base);
const allowed = /(^|[.-])(staging|stg|preview|dev|test)([.-]|$)|^localhost$|^127\.0\.0\.1$/i;
if (!allowed.test(target.hostname)) {
  console.error(`Refusing ${target.hostname}: not recognisably a staging or local host.`);
  process.exit(2);
}

const results = [];
function record(name, pass, detail, kind = "check") {
  results.push({ name, pass, detail, kind });
  console.log(`${pass ? "PASS" : kind === "finding" ? "OPEN" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function req(path, init = {}) {
  const res = await fetch(new URL(path, target), { redirect: "manual", ...init });
  const text = await res.text();
  return { status: res.status, text };
}

/* 1. An invalid ID token produces no session. */
{
  const r = await req("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: "not-a-real-token" }),
  });
  record("invalid ID token is refused by /api/auth/session", r.status === 401, `status ${r.status}`);
}

/* 2. Login CSRF probe: a cross-site, preflight-free request. A safe server
      refuses it before looking at the token (403/415). Reaching token
      verification (401) means a forged form post with a real attacker token
      would be accepted. Reported as an open finding, not a failure of this PR. */
{
  const r = await req("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "text/plain", origin: "https://attacker.example" },
    body: '{"idToken":"not-a-real-token","x":"="}',
  });
  const refusedEarly = r.status === 403 || r.status === 415;
  record(
    "cross-site text/plain session POST is refused before token verification",
    refusedEarly,
    `status ${r.status}${refusedEarly ? "" : " (handler reached: login CSRF open, ISS-109)"}`,
    "finding"
  );
}

/* 3. Bearer API refuses missing and invalid tokens. */
{
  const none = await req("/api/v1/me");
  record("/api/v1/me without a token is 401", none.status === 401, `status ${none.status}`);
  const bad = await req("/api/v1/me", { headers: { authorization: "Bearer not-a-real-token" } });
  record("/api/v1/me with an invalid token is 401", bad.status === 401, `status ${bad.status}`);
}

/* 4. Admin image upload refuses cross-site and unauthenticated callers. */
{
  const cross = await req("/api/admin/product-images", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  });
  record("image upload refuses a foreign Origin", cross.status === 403, `status ${cross.status}`);
  const anon = await req("/api/admin/product-images", { method: "POST", headers: { origin: target.origin } });
  record("image upload refuses a signed-out caller", anon.status === 403, `status ${anon.status}`);
}

/* 5. Cron endpoint refuses a caller without the secret. */
{
  const r = await req("/api/cron/cleanup-orders");
  record("cron endpoint refuses a caller without CRON_SECRET", r.status === 401 || r.status === 403, `status ${r.status}`);
}

/* 6. JSON-LD: every structured-data block parses, and none contains a raw "<". */
async function checkJsonLd(path) {
  const r = await req(path);
  if (r.status !== 200) {
    record(`JSON-LD on ${path}`, false, `page status ${r.status}`);
    return;
  }
  const blocks = [...r.text.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (blocks.length === 0) {
    record(`JSON-LD on ${path}`, false, "no structured data found");
    return;
  }
  let ok = true;
  const problems = [];
  for (const b of blocks) {
    if (b.includes("<")) {
      ok = false;
      problems.push("raw '<' inside a block");
    }
    try {
      JSON.parse(b);
    } catch {
      ok = false;
      problems.push("block is not valid JSON");
    }
  }
  record(`JSON-LD on ${path} (${blocks.length} block${blocks.length === 1 ? "" : "s"})`, ok, problems.join("; "));
}
await checkJsonLd("/");
if (productSlug) await checkJsonLd(`/product/${encodeURIComponent(productSlug)}`);

const failed = results.filter((r) => !r.pass && r.kind === "check");
const open = results.filter((r) => !r.pass && r.kind === "finding");
console.log(`\n${results.length - failed.length - open.length} passed, ${failed.length} failed, ${open.length} open finding(s).`);
process.exit(failed.length ? 1 : 0);
