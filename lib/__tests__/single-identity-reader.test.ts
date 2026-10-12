import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * There must be exactly one way to answer "who is this request?".
 *
 * This is a source-level test rather than a behavioural one because the bug it
 * guards against is invisible at runtime until a customer hits it. Identity
 * moved Supabase → Clerk → Firebase, and each move left call sites behind on
 * the previous provider. The last time, six of them survived: `placeOrder`,
 * `confirmRazorpayPayment`, `submitBooking`, the account and checkout pages and
 * the admin gate all still asked Supabase, which by then signed nobody in. They
 * did not throw. They returned "not logged in" to customers who were logged in,
 * so checkout was dead and every test stayed green.
 *
 * A behavioural test would not have caught it either: each of those call sites
 * was individually consistent. What was wrong was that the application had two
 * answers to one question. That is a property of the tree, so it is asserted
 * against the tree.
 *
 * If a future provider migration is genuinely mid-flight, add the file to
 * MIGRATING with the reason. An empty MIGRATING list is the healthy state.
 */

/* fileURLToPath, not URL.pathname: the checkout directory can contain a
   space, which pathname percent-encodes into a path readdirSync cannot open. */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SEARCH = ["actions", "app", "components", "lib"];

/** The one sanctioned abstraction. Everything else is a second reader. */
const SANCTIONED = /lib\/auth\/(current-user|session)\.ts$/;

/**
 * Files still on a retired provider, each with a reason. Emptying this list is
 * the goal; adding to it needs a deliberate decision, which is the point.
 */
const MIGRATING: Record<string, string> = {
  /* Empty since 12 Oct 2026: the Supabase OTP actions, provider, email-link
     callback and orphaned form were deleted rather than excused. */
};

/** Reading identity from anything but the sanctioned abstraction. */
const FOREIGN_READERS = [
  { pattern: /supabase\s*\.\s*auth\s*\.\s*getUser\s*\(/, name: "supabase.auth.getUser()" },
  { pattern: /supabase\s*\.\s*auth\s*\.\s*getSession\s*\(/, name: "supabase.auth.getSession()" },
  { pattern: /\bauth\s*\(\s*\)\s*\.\s*userId/, name: "Clerk auth().userId" },
  { pattern: /from\s+["']@clerk\//, name: "a @clerk/* import" },
  { pattern: /currentUser\s*\(\s*\)/, name: "Clerk currentUser()" },
];

/**
 * Strips comments before matching.
 *
 * Without this the rule fires on prose: `lib/services/admin/authz.ts` explains
 * in a comment which call it replaced and why, and got reported for describing
 * the very bug it fixes. A guard that punishes documentation trains people to
 * delete the documentation.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function walk(dir: string, out: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full) && !/__tests__|\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

test("identity is read through exactly one abstraction", () => {
  const offenders: string[] = [];
  let scanned = 0;

  for (const base of SEARCH) {
    for (const file of walk(join(ROOT, base))) {
      const rel = relative(ROOT, file);
      if (SANCTIONED.test(rel) || rel in MIGRATING) continue;

      scanned += 1;
      const src = code(readFileSync(file, "utf8"));
      for (const { pattern, name } of FOREIGN_READERS) {
        if (pattern.test(src)) offenders.push(`${rel} reads identity via ${name}`);
      }
    }
  }

  /* A scan that reaches no files passes trivially. An earlier version of this
     test did exactly that for weeks' worth of a session, so the count is
     asserted before the result is believed. */
  assert.ok(scanned > 100, `expected to scan the source tree, saw only ${scanned} files`);

  assert.deepEqual(
    offenders,
    [],
    "These files resolve the signed-in user without going through getAuthUserId()/getAuthUser(). " +
      "That is how checkout silently broke: two identity systems, one of which signs nobody in. " +
      "Route them through lib/auth/current-user.ts.\n  - " +
      offenders.join("\n  - ")
  );
});

test("every file excused from the rule is genuinely unreachable", () => {
  /* An excuse that outlives its migration is worse than no excuse: it reads as
     approval. A MIGRATING entry is only honest while nothing live imports the
     file, so that is what is checked rather than taken on trust. */
  const liveSources = SEARCH.flatMap((b) => walk(join(ROOT, b)))
    .filter((f) => !(relative(ROOT, f) in MIGRATING))
    .map((f) => readFileSync(f, "utf8"));

  for (const excused of Object.keys(MIGRATING)) {
    const specifier = "@/" + excused.replace(/\.tsx?$/, "");
    const importers = liveSources.filter((s) => s.includes(`from "${specifier}"`));
    assert.equal(
      importers.length,
      0,
      `${excused} is excused as dead, but ${importers.length} live file(s) still import it. ` +
        `Either migrate it off the retired provider or delete it — it is not dead.`
    );
  }
});

test("Supabase Auth is retired: no SDK, no OTP actions, no email-link callback", () => {
  /* The old callback was not dead just because nothing linked to it: a GET to
     /auth/confirm with any token_hash still ran supabase.auth.verifyOtp, and on
     staging (no Supabase auth config) answered 500. A route is reachable by URL
     and a "use server" export by POST whatever the UI imports, so retirement
     means the files are gone and nothing can bring the SDK back quietly.
     Supabase itself stays: Postgres over DATABASE_URL and the Storage image
     origin in next.config.ts do not use this SDK. */
  for (const gone of ["app/auth/confirm/route.ts", "actions/auth.ts", "lib/services/auth-provider.ts", "lib/supabase/server.ts"]) {
    assert.ok(!existsSync(join(ROOT, gone)), `${gone} is back — the Supabase sign-in path was retired 12 Oct 2026`);
  }

  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  assert.deepEqual(
    Object.keys(pkg.dependencies ?? {}).filter((d) => d.startsWith("@supabase/")),
    [],
    "a @supabase/* SDK is a dependency again; sign-in is Firebase (lib/auth)"
  );

  const offenders: string[] = [];
  for (const file of SEARCH.flatMap((b) => walk(join(ROOT, b)))) {
    const src = code(readFileSync(file, "utf8"));
    if (/from\s+["']@supabase\//.test(src)) offenders.push(`${relative(ROOT, file)} imports a @supabase/* SDK`);
    if (/supabase\s*\.\s*auth\b/.test(src)) offenders.push(`${relative(ROOT, file)} calls supabase.auth`);
    if (/signInWithOtp|verifyOtp\s*\(/.test(src)) offenders.push(`${relative(ROOT, file)} sends or verifies an OTP itself`);
  }
  assert.deepEqual(offenders, [], "Supabase sign-in is creeping back:\n  - " + offenders.join("\n  - "));
});
