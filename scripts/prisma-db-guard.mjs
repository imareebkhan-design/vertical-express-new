/**
 * Prisma CLI database guard.
 *
 * Loaded by prisma.config.ts, which loads `.env` — and `.env` holds the
 * production Supabase pooler. Without this, `npx prisma migrate dev`,
 * `npm run db:seed`, `db:deploy`, `db:status` or `prisma studio` typed in this
 * repository connected to production by default.
 *
 * `dev-db-guard.mjs` already protects `npm run dev`, and `db-guard.mjs`
 * protects the test suite. This closes the remaining door: the Prisma CLI.
 *
 * Commands that never open a connection (`generate`, `validate`, `format`,
 * `version`) pass, so cloud builds that only run `prisma generate` keep
 * working. Everything else is refused against a non-local host unless the
 * operator types VE_ALLOW_REMOTE_DB=1 on purpose.
 *
 * Never prints the connection string — only its hostname.
 */

const OFFLINE_COMMANDS = new Set(["generate", "validate", "format", "version", "init", "-v", "--version", "-h", "--help"]);

export function isLocalHost(host) {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host === "0.0.0.0" ||
    host.endsWith(".local")
  );
}

/**
 * Returns null when allowed, or a refusal message. Pure, for tests.
 * @param {string} url
 * @param {string[]} args  CLI arguments after the executable
 * @param {Record<string, string | undefined>} env
 */
export function prismaTargetRefusal(url, args, env) {
  const command = args.find((a) => !a.startsWith("--schema") && !a.startsWith("--config")) ?? "";
  /* Not running under the Prisma CLI with a command (e.g. imported by a tool),
     or a command that never connects. */
  if (!command || OFFLINE_COMMANDS.has(command)) return null;
  if (!url) return null;
  if (env.VE_ALLOW_REMOTE_DB === "1") return null;

  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (isLocalHost(host)) return null;

  return (
    `\n=== Prisma database guard: refusing \`prisma ${args.join(" ")}\` ===\n\n` +
    `  The resolved database is a remote host (${host}), not localhost.\n` +
    "  `.env` holds the production database, so this would have run against it.\n\n" +
    "  For local work, point DATABASE_URL / DIRECT_URL at a local database inline, e.g.\n" +
    "    DATABASE_URL=postgresql://$USER@localhost:5432/vertical_express_demo \\\n" +
    "    DIRECT_URL=postgresql://$USER@localhost:5432/vertical_express_demo npx prisma ...\n\n" +
    "  For a deliberate, reviewed remote operation (staging migration after a backup):\n" +
    "    VE_ALLOW_REMOTE_DB=1 DIRECT_URL=<target> npx prisma ...\n\n"
  );
}

export function assertPrismaTargetAllowed(url, args, env) {
  const refusal = prismaTargetRefusal(url, args, env);
  if (refusal) {
    process.stderr.write(refusal);
    process.exit(1);
  }
}
