import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every way into the console must be gated, and there are three of them.
 *
 * ISS-027 says admin authorization is "an environment allowlist only". That is
 * true of the *policy* and it is worth separating from the *mechanism*, because
 * checking the code found the mechanism sound:
 *
 *   Pages          `app/admin/layout.tsx` calls `adminGate()` and redirects.
 *                  A layout wraps every route beneath it, so the individual
 *                  pages correctly do not repeat the check — and a test that
 *                  demanded they each gate would be wrong.
 *   Server actions Every `admin*` action calls `getAdminUser()` and returns
 *                  FORBIDDEN. A layout cannot protect these: an action is
 *                  reachable by POST without rendering any page.
 *   Route handlers There are no admin ones. The public handlers are public on
 *                  purpose, and the two privileged ones carry a shared secret
 *                  or a verified signature.
 *
 * The gap that matters is the third: a new route handler under `app/api` that
 * reads or writes admin data would be protected by nothing at all, and nothing
 * would say so. This is the test that says so.
 *
 * `getAdminUser` itself rejects an unverified email, which is load-bearing under
 * Firebase in a way it was not under Supabase — email/password sign-up sets
 * `email` on the token before anyone proves they can read that inbox.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

test("the admin layout is what gates the console", () => {
  /* Non-vacuity, and the load-bearing fact: if this stops gating, twenty-six
     pages silently open at once. */
  const layout = read("app/admin/layout.tsx");
  assert.match(layout, /adminGate\(\)/, "app/admin/layout.tsx no longer calls adminGate");
  assert.match(layout, /redirect\(/, "the admin layout no longer redirects an unauthorised visitor");

  const pages = walk(join(ROOT, "app/admin")).filter((f) => f.endsWith("page.tsx"));
  assert.ok(pages.length >= 20, `only ${pages.length} admin pages found`);
});

test("every admin server action checks the operator itself", () => {
  /* A layout cannot help here — an action is reachable by POST without any page
     being rendered, so each one carries its own check. */
  for (const file of walk(join(ROOT, "actions")).filter((f) => f.endsWith(".ts"))) {
    const rel = relative(ROOT, file);
    const src = readFileSync(file, "utf8");

    for (const m of src.matchAll(/export async function (admin[A-Za-z0-9_]*)/g)) {
      const from = m.index ?? 0;
      /* The check must be at the top of the function, before any work. */
      const head = src.slice(from, from + 400);
      assert.match(
        head,
        /getAdminUser\(\)/,
        `${rel}: ${m[1]} does not check getAdminUser() before doing anything`
      );
    }
  }
});

test("no route handler reads admin data without gating itself", () => {
  /* The real hole this test exists for. A handler under app/api is not covered
     by the admin layout, so a new one touching admin data would be open. */
  const PUBLIC_BY_DESIGN = new Set([
    "app/api/auth/session/route.ts", // this is how you sign in; rate-limited
    "app/api/health/route.ts",
    "app/api/search/suggest/route.ts",
    "app/api/serviceability/[pincode]/route.ts",
  ]);
  const SECRET_OR_SIGNATURE = new Set([
    "app/api/cron/cleanup-orders/route.ts",
    "app/api/webhooks/razorpay/route.ts",
  ]);

  /**
   * A fourth kind, added with /api/v1: authenticated as a CUSTOMER.
   *
   * These carry a Firebase ID token in an Authorization header, because the
   * native app has no cookie jar and cannot resend the httpOnly session cookie
   * the web uses. So they hold no admin check, no shared secret and no
   * signature, and would have failed the assertion below — but they are not
   * public either, and listing one as "public by design" would be a false
   * statement that removes it from every future sweep.
   *
   * The requirement is therefore stated rather than waived: each route names
   * the module that holds its authentication, and that module must resolve an
   * identity. The route files themselves are deliberately thin — a handler is
   * kept in lib/ so it can be driven by a test with a stubbed verifier — so
   * checking the route source alone would prove nothing.
   */
  const CUSTOMER_AUTHENTICATED: Record<string, string> = {
    "app/api/v1/cart/items/route.ts": "lib/api/cart-items.ts",
  };

  const handlers = walk(join(ROOT, "app/api"))
    .filter((f) => f.endsWith("route.ts"))
    .map((f) => relative(ROOT, f));

  assert.ok(handlers.length >= 5, `only ${handlers.length} route handlers found`);

  for (const rel of handlers) {
    if (PUBLIC_BY_DESIGN.has(rel) || SECRET_OR_SIGNATURE.has(rel)) continue;

    const authModule = CUSTOMER_AUTHENTICATED[rel];
    if (authModule) {
      assert.match(
        read(authModule),
        /resolveApiIdentity\(/,
        `${rel} is listed as customer-authenticated, but ${authModule} no longer ` +
          `resolves an identity. It is now an open endpoint.`
      );
      continue;
    }

    const src = read(rel);
    assert.match(
      src,
      /getAdminUser\(\)|isAdmin\(\)|adminGate\(\)|timingSafeEqual|CRON_SECRET/,
      `${rel} is a new route handler with no admin check, no shared secret and no ` +
        `signature check. The admin layout does not cover app/api.`
    );
  }
});

test("an unverified email cannot be an operator", () => {
  /* Firebase sets `email` on the token at email/password sign-up, before anyone
     proves they can read that inbox. Allowlisting an unverified address would
     let anybody sign up as an address in ADMIN_EMAILS and walk in. */
  const authz = read("lib/services/admin/authz.ts");
  assert.match(
    authz,
    /token\.email_verified\s*!==\s*true/,
    "getAdminUser no longer requires a verified email, so the allowlist can be claimed by signing up"
  );
});

test("the allowlist fails closed when it is empty", () => {
  /* An unset ADMIN_EMAILS must grant nobody, not everybody. */
  const authz = read("lib/services/admin/authz.ts");
  assert.match(
    authz,
    /adminEmails\(\)\.includes\(email\)/,
    "admin membership is no longer an explicit allowlist test"
  );
  assert.ok(
    !/adminEmails\(\)\.length\s*===\s*0/.test(authz),
    "an empty allowlist is being special-cased, which is how 'no config' becomes 'everyone'"
  );
});

test("User.role is unused, and that is a recorded position rather than an oversight", () => {
  /* The schema has had a Role enum since the beginning and nothing reads it.
     Moving admin membership into the database would remove the redeploy needed
     to add an operator — and would also mean anybody who can write the database
     can make themselves an operator, which the env var does not allow. That is
     a trade the owner should make deliberately (ISS-027), so this pins the
     current state rather than quietly changing it. */
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /enum Role \{/, "the Role enum has gone");

  const authz = read("lib/services/admin/authz.ts");
  assert.ok(
    !/\brole\b/.test(authz.replace(/\/\*[\s\S]*?\*\//g, " ")),
    "authz now reads User.role — if admin membership has moved into the database, " +
      "ISS-027's trade-off has been decided and this test should be replaced by one " +
      "covering the new rule"
  );
});
