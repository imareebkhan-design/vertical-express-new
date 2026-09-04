/**
 * Development database guard.
 *
 * Runs as `predev`, so it executes before `next dev` binds a port and long
 * before a request can reach Prisma.
 *
 * `npm run dev` reads DATABASE_URL from `.env`, and `.env` holds the production
 * Supabase pooler. So the plain dev script pointed a *writable* development
 * server at live customer data: every cart write, order placement, admin action
 * and seed script would have landed in production. It was found because the
 * schema had moved ahead of production and the home page crashed with
 * `P2022: the column products.delivery_speed does not exist` — the failure was
 * the only reason anybody noticed where it was connected.
 *
 * That is the same accident CLAUDE.md already records once for this project,
 * via `directUrl`. A crash is a lucky outcome; silently working would have been
 * the bad one.
 *
 * Localhost is allowed. Anything else is refused unless the operator has said
 * so deliberately with VE_ALLOW_REMOTE_DB=1, which is a thing you can only type
 * on purpose.
 *
 * Never prints the connection string.
 */

import { readFileSync } from "node:fs";

/**
 * Resolve DATABASE_URL exactly the way `next dev` will.
 *
 * The first version of this read `process.env.DATABASE_URL` and exited clean —
 * because npm does not load `.env`; Next.js does, after the predev hook has
 * already finished. So the guard passed, the server started against
 * production, and the guard written to prevent that had proved nothing. It is
 * the same failure mode as a test that passes because it asserts on the wrong
 * half.
 *
 * An inline value still wins, which is what `dev:local` and `dev:demo` set, so
 * those remain instant passes.
 */
function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  /* Next.js precedence for `next dev` (NODE_ENV=development): the first file
     to define the variable wins. */
  const files = [".env.development.local", ".env.local", ".env.development", ".env"];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const m = /^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      /* Strip surrounding quotes and any trailing comment outside them. */
      const raw = m[1].trim();
      const quoted = /^(['"])([\s\S]*?)\1/.exec(raw);
      const value = quoted ? quoted[2] : raw.split("#")[0].trim();
      if (value) return value;
    }
  }
  return "";
}

const url = resolveDatabaseUrl();

function refuse(reason, remedy) {
  process.stderr.write(
    "\n=== Dev database guard: refusing to start ===\n\n" +
      "  " +
      reason +
      "\n\n" +
      remedy.map((l) => "  " + l).join("\n") +
      "\n\n" +
      "  A dev server writes real rows. This guard exists so it can never do\n" +
      "  that to production.\n\n"
  );
  process.exit(1);
}

if (!url) {
  /* Not an error: Prisma will say so far more precisely than this can, and a
     missing URL cannot reach production by definition. */
  process.exit(0);
}

if (process.env.VE_ALLOW_REMOTE_DB === "1") {
  process.stderr.write(
    "\n  Dev database guard: VE_ALLOW_REMOTE_DB=1 — starting against a remote\n" +
      "  database on purpose. Writes here are real.\n\n"
  );
  process.exit(0);
}

let host;
try {
  host = new URL(url).hostname;
} catch {
  /* An unparseable URL is Prisma's problem to report, not this script's. It
     also cannot be a working production connection. */
  process.exit(0);
}

const isLocal =
  host === "localhost" ||
  host === "127.0.0.1" ||
  host === "::1" ||
  host === "0.0.0.0" ||
  host.endsWith(".local");

if (!isLocal) {
  refuse(
    `DATABASE_URL points at a remote host (${host}), not localhost.`,
    [
      "Use a local database instead:",
      "",
      "    npm run dev:demo     storefront on :3000, vertical_express_demo",
      "    npm run dev:local    same app on :3100, vertical_express_demo",
      "",
      "Both override DATABASE_URL and DIRECT_URL inline, so neither can reach",
      "production whatever .env says.",
      "",
      "If you genuinely mean to run against a remote database, say so:",
      "",
      "    VE_ALLOW_REMOTE_DB=1 npm run dev",
    ]
  );
}
