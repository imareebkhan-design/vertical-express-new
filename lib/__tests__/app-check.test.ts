import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * OTP sends must be attestable, and must not break when they are not.
 *
 * The retired Supabase path rate-limited OTP sends in front of our own server:
 * five per identifier per fifteen minutes, failing closed, because each send
 * costs money and reaches a real handset (DEC-016). Firebase moved the send
 * into the browser — `signInWithPhoneNumber` calls Google directly — so our
 * server left the path and the limiter stopped being implementable where it
 * lived. ISS-047 stayed open rather than being closed with a limiter on a
 * server action, which would have protected nothing while looking like
 * protection.
 *
 * App Check is the documented replacement: it attests the caller is our real
 * app before Firebase will send an SMS. The invisible reCAPTCHA on the sign-in
 * form is a bot check on one request, not a volume control, and does not
 * substitute.
 *
 * Two things this pins, and they pull in opposite directions:
 *
 *   1. The wiring exists, so the protection is one console setting away.
 *   2. It stays inert until a site key is set. Starting App Check before the
 *      Firebase Console knows about this site would block every sign-in rather
 *      than protect it — a worse outcome than the exposure, and one that would
 *      be discovered by customers.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const client = readFileSync(join(ROOT, "lib/firebase/client.ts"), "utf8");

/** Code only — the comment explains the defect and names the old mechanism. */
const code = client
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");

test("the Firebase client still initialises", () => {
  /* Non-vacuity: an over-eager comment stripper leaves every assertion below
     passing on an empty string. */
  assert.match(code, /initializeApp\(config\)/, "the Firebase app is no longer created");
  assert.match(code, /getAuth\(/, "the auth client has gone");
});

test("App Check is wired to the real SDK", () => {
  assert.match(code, /initializeAppCheck\(/, "App Check is not initialised anywhere");
  assert.match(
    code,
    /ReCaptcha(V3|Enterprise)Provider/,
    "no reCAPTCHA provider is constructed for App Check"
  );
  assert.match(
    code,
    /isTokenAutoRefreshEnabled:\s*true/,
    "App Check tokens will not refresh, so long sessions lose attestation"
  );
});

test("App Check does not start without a site key", () => {
  /* The half that matters more day to day. Enabling it in code before the
     console is configured takes sign-in down for everybody. */
  assert.match(
    code,
    /if\s*\(\s*appCheckStarted\s*\|\|\s*!APP_CHECK_SITE_KEY\s*\)\s*return/,
    "App Check starts even with no site key configured"
  );
  assert.match(
    code,
    /NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY/,
    "the site key is no longer read from the environment"
  );
});

test("a broken App Check cannot take sign-in down with it", () => {
  /* Degrade to today's behaviour, never to a site nobody can log in to. */
  assert.match(
    code,
    /try\s*\{[\s\S]{0,400}initializeAppCheck[\s\S]{0,400}\}\s*catch/,
    "initializeAppCheck is not guarded, so a rejected key breaks sign-in"
  );
});

test("every Firebase variable the code reads is in .env.example", () => {
  /* ISS-053: production has none of these set, and the template listed none of
     them either — so there was nothing to check a deployment against. A
     variable the code reads and the template omits is the shape of that
     failure. */
  const example = readFileSync(join(ROOT, ".env.example"), "utf8");

  const read = new Set<string>();
  for (const dir of ["lib", "app", "actions", "components"]) {
    const stack = [join(ROOT, dir)];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const name of readdirSync(cur)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const full = join(cur, name);
        if (statSync(full).isDirectory()) stack.push(full);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          for (const m of readFileSync(full, "utf8").matchAll(
            /process\.env\.([A-Z0-9_]*FIREBASE[A-Z0-9_]*)/g
          )) {
            read.add(m[1]);
          }
        }
      }
    }
  }

  assert.ok(read.size >= 8, `only ${read.size} Firebase variables found in the source`);
  for (const name of [...read].sort()) {
    assert.ok(
      example.includes(name),
      `${name} is read by the code but absent from .env.example — ISS-053 is exactly this`
    );
  }
});
