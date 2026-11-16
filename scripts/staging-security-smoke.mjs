#!/usr/bin/env node
/**
 * Read-only security smoke checks against a STAGING deployment (ISS-108).
 *
 *   node scripts/staging-security-smoke.mjs https://staging-host product-slug
 *
 * It sends no credentials and writes nothing: every request is either
 * unauthenticated or carries a deliberately invalid token, and every check
 * expects a refusal. The signed-in checks (session lifecycle, revocation,
 * image upload, test-mode checkout) need a real staging account and are a
 * manual runbook: docs/security/staging-smoke-iss-108.md.
 *
 * Exit code: 1 if any check fails. The login-CSRF probe (ISS-109) reports OPEN
 * while that issue stands; OPEN does not fail the run, but it is never PASS.
 */
import { classifyCsrfProbe, isAllowedSmokeHost, validateJsonLd } from "./staging-smoke-checks.mjs";

const [baseArg, productSlug] = process.argv.slice(2);
if (!baseArg || !productSlug) {
  console.error("usage: node scripts/staging-security-smoke.mjs STAGING_BASE_URL PRODUCT_SLUG");
  process.exit(2);
}
const target = new URL(baseArg);
if (!isAllowedSmokeHost(target.hostname)) {
  console.error(`Refusing ${target.hostname}: not recognisably a staging or local host.`);
  process.exit(2);
}

const results = [];
function record(name, outcome, detail) {
  results.push({ name, outcome, detail });
  console.log(`${outcome.toUpperCase().padEnd(4)}  ${name}${detail ? ` — ${detail}` : ""}`);
}
const expect = (name, ok, detail) => record(name, ok ? "pass" : "fail", detail);

/* Only paths on the operator-chosen, allowlisted staging origin are fetched;
   the path is always a literal from this file (or the slug, URL-encoded). */
async function req(path, init = {}) {
  const url = new URL(path, target);
  if (url.origin !== target.origin) throw new Error(`refusing off-origin request to ${url.origin}`);
  // nosemgrep: rules_lgpl_javascript_ssrf_rule-node-ssrf -- operator CLI tool; origin pinned to the allowlisted staging host above.
  const res = await fetch(url, { redirect: "manual", ...init });
  return { status: res.status, text: await res.text() };
}

/* 1. An invalid ID token produces no session. */
{
  const r = await req("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: "not-a-real-token" }),
  });
  expect("invalid ID token is refused by /api/auth/session", r.status === 401, `status ${r.status}`);
}

/* 2. Login-CSRF probe (ISS-109): cross-site, preflight-free text/plain POST. */
{
  const r = await req("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "text/plain", origin: "https://attacker.example" },
    body: '{"idToken":"not-a-real-token","x":"="}',
  });
  const c = classifyCsrfProbe(r.status);
  record("cross-site text/plain session POST is refused before token verification", c.outcome, c.detail);
}

/* 3. Bearer API refuses missing and invalid tokens. */
{
  const none = await req("/api/v1/me");
  expect("/api/v1/me without a token is 401", none.status === 401, `status ${none.status}`);
  const bad = await req("/api/v1/me", { headers: { authorization: "Bearer not-a-real-token" } });
  expect("/api/v1/me with an invalid token is 401", bad.status === 401, `status ${bad.status}`);
}

/* 4. Admin image upload refuses cross-site and unauthenticated callers. */
{
  const cross = await req("/api/admin/product-images", { method: "POST", headers: { origin: "https://attacker.example" } });
  expect("image upload refuses a foreign Origin", cross.status === 403, `status ${cross.status}`);
  const anon = await req("/api/admin/product-images", { method: "POST", headers: { origin: target.origin } });
  expect("image upload refuses a signed-out caller", anon.status === 403, `status ${anon.status}`);
}

/* 5. Cron endpoint refuses a caller without the secret. */
{
  const r = await req("/api/cron/cleanup-orders");
  expect("cron endpoint refuses a caller without CRON_SECRET", r.status === 401 || r.status === 403, `status ${r.status}`);
}

/* 6. JSON-LD: home page blocks are valid; the product page must carry a named Product node. */
async function checkJsonLd(path, requiredType) {
  const r = await req(path);
  if (r.status !== 200) return expect(`JSON-LD on ${path}`, false, `page status ${r.status}`);
  const v = validateJsonLd(r.text, requiredType);
  expect(`JSON-LD on ${path}${requiredType ? ` (requires ${requiredType})` : ""}`, v.ok, v.ok ? `${v.blocks} block(s)` : v.problems.join("; "));
}
await checkJsonLd("/");
await checkJsonLd(`/product/${encodeURIComponent(productSlug)}`, "Product");

const count = (o) => results.filter((r) => r.outcome === o).length;
console.log(`\n${count("pass")} passed, ${count("fail")} failed, ${count("open")} open finding(s).`);
process.exit(count("fail") ? 1 : 0);
