import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Sign-out has two scopes and they must stay different.
 *
 * Ordinary sign-out clears this browser's cookie only — signing out on a phone
 * must not sign the same person out on their laptop. But a cleared cookie is
 * still cryptographically valid for its full fourteen days, so a copied one
 * survives, which is exactly the case where signing out is urgent. `scope=all`
 * revokes the refresh tokens, and `readSession`'s `checkRevoked` then rejects
 * every outstanding cookie.
 *
 * Both halves are load-bearing: revoking on every sign-out would be a usability
 * regression, and never revoking leaves no way to kill a stolen session.
 */
const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

const route = read("../../app/api/auth/session/route.ts");
const session = read("../../lib/auth/session.ts");

test("readSession verifies with revocation checking on", () => {
  /* Without `true` here, revocation is inert: revoked cookies keep resolving
     until they expire, and scope=all becomes decorative. */
  assert.ok(
    /verifySessionCookie\(\s*value\s*,\s*true\s*\)/.test(session),
    "verifySessionCookie must be called with checkRevoked = true"
  );
});

test("revoking is reachable, and only under scope=all", () => {
  assert.ok(/revokeAllSessions/.test(session), "the revocation helper must exist");
  assert.ok(/revokeAllSessions/.test(route), "DELETE must be able to revoke");
  assert.ok(
    /scope\s*===\s*"all"/.test(route),
    "revocation must be gated on scope=all, never the default"
  );

  /* The cookie clear must sit OUTSIDE the scope check — a plain sign-out still
     has to clear this browser. */
  const afterGate = route.slice(route.indexOf('scope === "all"'));
  assert.ok(
    /maxAge:\s*0/.test(afterGate),
    "every DELETE, scoped or not, must clear the current cookie"
  );
});

test("the session cookie carries the flags that make it a session cookie", () => {
  for (const [flag, why] of [
    ["httpOnly: true", "client script must not be able to read a two-week session"],
    ['sameSite: "lax"', "this is what blocks cross-site submission"],
    ['secure: process.env.NODE_ENV === "production"', "must not travel over plaintext in production"],
  ] as const) {
    assert.ok(route.includes(flag), `${flag} is missing — ${why}`);
  }
});

test("the ID token is verified, and only a fresh one is upgraded to a session", () => {
  assert.ok(/verifyIdToken\(idToken,\s*true\)/.test(session), "the ID token must be verified");
  assert.ok(
    /auth_time/.test(session) && /5\s*\*\s*60\s*\*\s*1000/.test(session),
    "a stolen long-lived ID token must not be upgradeable into a two-week session"
  );
});

test("the unauthenticated session endpoint is rate limited, and fails open", () => {
  assert.ok(/rateLimit\(/.test(route), "an unauthenticated route must be throttled");
  assert.ok(
    !/failClosed:\s*true/.test(route),
    "failing closed here would lock every customer out of signing in when the limiter is down"
  );
});
