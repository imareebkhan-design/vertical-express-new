import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Every origin sign-in touches must be in the right CSP directive.
 *
 * This has now broken twice, the same way both times. Clerk's script was
 * blocked by script-src and the sign-in page rendered blank; then reCAPTCHA's
 * callback was blocked by connect-src and phone auth could not complete. Both
 * looked like auth bugs and were policy bugs, and both were invisible from the
 * server — nothing throws, the console logs a violation, and the flow simply
 * stops.
 *
 * The trap is that one origin usually needs to appear in several directives.
 * reCAPTCHA loads a script (script-src), renders a frame (frame-src) and posts
 * its result back (connect-src). Having two of the three looks complete and is
 * not.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL("../../next.config.ts", import.meta.url)),
  "utf8"
);

/**
 * The directive array as written, so membership can be checked per directive.
 *
 * Located by the opening backtick and the directive name only. Matching the
 * full `` `script-src 'self'` `` would miss it, because script-src also carries
 * 'unsafe-inline' — which is exactly the kind of near-miss this test exists to
 * catch, and it caught itself first.
 */
function directive(name: string): string {
  const i = SOURCE.indexOf("`" + name + " ");
  assert.ok(i > -1, `${name} not found in the CSP`);
  const end = SOURCE.indexOf("]", i);
  return SOURCE.slice(i, end);
}

test("reCAPTCHA is allowed to load, frame AND report back", () => {
  /* The third is the one that was missing. Without connect-src the bot check
     runs, cannot post its result, and phone sign-in never proceeds. */
  for (const d of ["script-src", "frame-src", "connect-src"]) {
    assert.ok(
      directive(d).includes("RECAPTCHA"),
      `reCAPTCHA is missing from ${d} — the invisible bot check needs all three`
    );
  }
});

test("Firebase auth origins are present where each is used", () => {
  assert.ok(
    directive("connect-src").includes("identitytoolkit.googleapis.com"),
    "the Identity Toolkit API is where sign-in actually happens"
  );
  assert.ok(
    directive("connect-src").includes("securetoken.googleapis.com"),
    "token refresh runs against securetoken"
  );
  assert.ok(
    directive("frame-src").includes("FIREBASE_AUTH_DOMAIN"),
    "the Google sign-in popup renders from the auth domain"
  );
});

test("no auth origin is hardcoded to a specific project", () => {
  /* The auth domain comes from env so a project rename does not silently break
     sign-in in one environment while working in another. */
  assert.ok(
    /FIREBASE_AUTH_DOMAIN\s*=\s*process\.env\./.test(SOURCE),
    "the Firebase auth domain must be derived from configuration"
  );
});
