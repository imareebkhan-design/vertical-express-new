import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The console must never send an already-signed-in person to the sign-in page.
 *
 * THE LOOP
 *
 * `app/admin/layout.tsx` guarded on `getAdminUser()` and redirected every
 * failure to `/login?next=/admin`. `app/(auth)/login/page.tsx` correctly
 * bounces anyone holding a session, so a signed-in customer went
 * /admin → /login → / and landed on the storefront with no explanation, every
 * time they tried.
 *
 * It was not an edge case. Phone sign-in — the market's default, and the
 * identity this product is built around — produces no verified email, so it can
 * never satisfy the operator allowlist and ALWAYS took this path. Every phone
 * customer who touched an admin link hit it, and so did the owner.
 *
 * The root cause was conflating two failures that need opposite answers: not
 * authenticated, and not authorized. `adminGate()` separates them.
 *
 * These are source assertions because the loop is a relationship between two
 * files' redirect targets, which no single unit test observes.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
/**
 * Source with comments removed, so a claim in a comment can never satisfy an
 * assertion about code.
 *
 * The `[^:"\']` guard is load-bearing and was missing at first: without it,
 * `startsWith("//")` reads as the start of a line comment and the rest of that
 * line is deleted, so an assertion about open-redirect protection could never
 * pass no matter what the file said. A stripper that eats real code fails
 * closed here, but the same mistake in a test asserting an *absence* would fail
 * open and pass silently.
 */
const read = (rel: string) =>
  readFileSync(join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");

/** Every file under app/admin that performs a redirect. */
const ADMIN_FILES = ["app/admin/layout.tsx", "app/admin/bi/page.tsx"];

test("no admin route redirects to the sign-in page on an authorization failure", () => {
  for (const rel of ADMIN_FILES) {
    const src = read(rel);
    const loginRedirects = [...src.matchAll(/redirect\(\s*[`"']\/login[^`"')]*/g)].map((m) => m[0]);

    for (const r of loginRedirects) {
      /* A redirect to /login is only ever correct for an anonymous visitor.
         The one in the layout is guarded on gate.state === "anonymous"; any
         other is the bug returning. */
      assert.ok(
        /anonymous/.test(src),
        `${rel} redirects to /login (${r}) without first establishing that nobody ` +
          `is signed in. A signed-in non-admin sent there is bounced straight back.`
      );
    }
  }
});

test("the admin layout answers a signed-in non-operator itself", () => {
  const src = read("app/admin/layout.tsx");
  assert.ok(src.includes("adminGate"), "the layout no longer uses the shared gate");
  assert.ok(
    /not-admin/.test(src) && /NotAnAdmin/.test(src),
    "the layout does not render an explanation for a signed-in non-operator. " +
      "A redirect cannot carry a reason, and the reason — sign in as a different " +
      "account — is not something anybody guesses from landing on the shop."
  );
});

test("the BI page never redirects to sign-in", () => {
  /* A page and its layout both run. A redirect here fires even while the
     layout is rendering the explanation, which reinstates the bounce for this
     one route. */
  const src = read("app/admin/bi/page.tsx");
  assert.ok(
    !/redirect\(\s*[`"']\/login/.test(src),
    "app/admin/bi/page.tsx redirects to /login. Its layout has already gated; " +
      "this fires anyway and reinstates the loop for /admin/bi."
  );
});

test("the sign-in page sends a signed-in visitor where they were going", () => {
  const src = read("app/(auth)/login/page.tsx");
  assert.ok(
    /redirect\(safeNext\)/.test(src),
    "the sign-in page discards `next` for a signed-in visitor and drops them at " +
      "the home page, losing what they were trying to reach."
  );
  assert.ok(
    /startsWith\("\/"\)/.test(src) && /startsWith\("\/\/"\)/.test(src),
    "the `next` target is no longer constrained to a same-site path — that is an " +
      "open redirect"
  );
});

test("the account screen shows a real identity, never an invented one", () => {
  /* These were not placeholders for signed-out visitors; that page redirects
     those away. They were what every customer without an email — most of this
     market — saw as their own name. */
  const src = read("components/mobile/account/mobile-account-view.tsx");
  for (const invented of ["VE Builder", "ve-user@example.com"]) {
    assert.ok(!src.includes(invented), `"${invented}" is still shown as a customer identity`);
  }
  assert.ok(
    /phone \?\? email/.test(src),
    "the account screen does not lead with the phone number, which is how this " +
      "market signs in"
  );
});
