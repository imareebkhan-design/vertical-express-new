/**
 * Test database guard.
 *
 * Loaded with `node --import` before anything else in the test run, so it
 * executes before Prisma is instantiated and before any test can write a row.
 *
 * The suite creates and mutates real rows — orders, payments, webhook events,
 * inventory. Pointing it at a shared or production database corrupts real data,
 * so running is refused unless the database has been explicitly marked
 * disposable via VE_TEST_DATABASE=1 in .env.test.
 *
 * Never prints the connection string.
 */

function refuse(reason, remedy) {
  process.stderr.write(
    "\n=== Test database guard: refusing to run ===\n\n" +
      "  " +
      reason +
      "\n\n" +
      remedy.map((l) => "  " + l).join("\n") +
      "\n\n" +
      "  The suite writes real rows. This guard exists so it can never do that\n" +
      "  to a shared or production database.\n\n"
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;

if (!url) {
  refuse("DATABASE_URL is not set.", [
    "Create .env.test (see .env.test.example), then:",
    "  npm run db:test:setup",
  ]);
}

if (process.env.VE_TEST_DATABASE !== "1") {
  refuse("DATABASE_URL is not marked as a test database.", [
    "The suite only runs against a database that declares itself disposable.",
    "",
    "Add to .env.test:",
    "  VE_TEST_DATABASE=1",
    "",
    "If DATABASE_URL is currently resolving from .env, that is your application",
    "database — the guard has just stopped the suite from writing to it.",
  ]);
}

let hostname = "";
try {
  hostname = new URL(url).hostname;
} catch {
  refuse("DATABASE_URL is not a parseable URL.", ["Check the value in .env.test."]);
}

const MANAGED =
  /(supabase\.(co|com)|neon\.tech|rds\.amazonaws\.com|render\.com|railway\.app|azure\.com|planetscale)/i;

if (MANAGED.test(hostname) && process.env.VE_TEST_DATABASE_ALLOW_REMOTE !== "1") {
  refuse("DATABASE_URL points at a managed database host.", [
    "Tests default to a local Postgres. To use a dedicated remote test database",
    "anyway — never the application's — set both:",
    "  VE_TEST_DATABASE=1",
    "  VE_TEST_DATABASE_ALLOW_REMOTE=1",
  ]);
}
