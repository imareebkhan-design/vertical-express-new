#!/usr/bin/env node
/**
 * Deploy-time migration gate — ISS-024.
 *
 * `vercel-build` used to be `prisma generate && prisma migrate deploy && next
 * build`, so every production deployment applied pending migrations with no
 * gate, no review and no rehearsal. On a database holding orders and payments
 * that was the highest-consequence operational risk in the project: a migration
 * failing mid-deploy leaves production in an unknown state.
 *
 * Simply dropping `migrate deploy` is not enough either — then a deploy can
 * ship code that expects a column the database does not have, and the failure
 * moves from build time to runtime, in front of customers.
 *
 * So the build no longer WRITES to the database; it only ASKS. If migrations
 * are pending, the build fails with instructions. Applying them stays a
 * deliberate, human-timed act:
 *
 *     npm run db:deploy      # apply, when you have chosen to
 *
 * Escape hatch, for a genuine emergency where the two must ship together:
 *     ALLOW_AUTO_MIGRATE=1   # applies migrations during the build, as before
 * It is loud on purpose. Reach for it knowingly, not by habit.
 */
import { execSync } from "node:child_process";

const AUTO = process.env.ALLOW_AUTO_MIGRATE === "1";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

if (AUTO) {
  console.warn("⚠ ALLOW_AUTO_MIGRATE=1 — applying migrations during the build (ISS-024 gate bypassed).");
  console.warn(run("npx prisma migrate deploy"));
  process.exit(0);
}

try {
  const out = run("npx prisma migrate status");
  console.log(out.trim());
  console.log("✓ database schema matches this build — no migration needed");
} catch (err) {
  const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
  console.error(out);
  console.error(`
────────────────────────────────────────────────────────────────────────
  BUILD STOPPED — the database has pending migrations. (ISS-024)

  This build will NOT apply them. Migrations against a database holding
  orders and payments are a deliberate act, not a side effect of a deploy.

  Apply them yourself, when you are watching:

      npm run db:deploy

  ...then re-run this deploy.

  Emergency only — ship both together, knowing the risk:

      ALLOW_AUTO_MIGRATE=1
────────────────────────────────────────────────────────────────────────`);
  process.exit(1);
}
