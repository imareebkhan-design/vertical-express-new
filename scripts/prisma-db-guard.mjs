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
 * operator names the target twice, independently:
 *
 *   VE_ALLOW_REMOTE_DB=1  VE_EXPECTED_DB_REF=<supabase project ref>
 *
 * The ref is parsed from the connection string itself (pooler user
 * `postgres.<ref>` or host `db.<ref>.supabase.co`) and must match. An allow
 * flag alone proves nothing about WHICH database it is — a staging command run
 * with production's URL still in `.env` would otherwise pass.
 *
 * The production project additionally needs VE_CONFIRM_PRODUCTION_DB=<ref>.
 * There is no automatic path to production.
 *
 * Never prints the connection string — only its hostname.
 */

/** Production Supabase project (docs/release/FINAL_PRODUCTION_PLAN.md). Not a secret. */
export const PRODUCTION_DB_REFS = new Set(["gsfslnxvwmrgulzqypdp"]);

/** Supabase project ref from a connection string, or null when it is not a Supabase URL. */
export function supabaseRef(url) {
  try {
    const u = new URL(url);
    const host = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname);
    if (host) return host[1];
    const user = /^postgres\.([a-z0-9]{20})$/.exec(decodeURIComponent(u.username));
    if (user && u.hostname.endsWith(".supabase.com")) return user[1];
  } catch {
    /* fall through */
  }
  return null;
}

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

  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (isLocalHost(host)) return null;

  if (env.VE_ALLOW_REMOTE_DB === "1") {
    const ref = supabaseRef(url);
    const expected = env.VE_EXPECTED_DB_REF ?? "";
    if (!expected) {
      return `\n=== Prisma database guard: VE_EXPECTED_DB_REF is required with VE_ALLOW_REMOTE_DB=1 ===\n\n  Name the project you mean (e.g. the staging ref). Target host: ${host}\n\n`;
    }
    if (ref !== expected) {
      return `\n=== Prisma database guard: target mismatch ===\n\n  Expected project ${expected}, but the connection string resolves to ${ref ?? `a non-Supabase host (${host})`}.\n  Refusing. Check which env file supplied DATABASE_URL / DIRECT_URL.\n\n`;
    }
    if (PRODUCTION_DB_REFS.has(ref) && env.VE_CONFIRM_PRODUCTION_DB !== ref) {
      return `\n=== Prisma database guard: ${ref} is PRODUCTION ===\n\n  Production changes require owner approval and VE_CONFIRM_PRODUCTION_DB=${ref}.\n\n`;
    }
    return null;
  }

  return (
    `\n=== Prisma database guard: refusing \`prisma ${args.join(" ")}\` ===\n\n` +
    `  The resolved database is a remote host (${host}), not localhost.\n` +
    "  `.env` holds the production database, so this would have run against it.\n\n" +
    "  For local work, point DATABASE_URL / DIRECT_URL at a local database inline, e.g.\n" +
    "    DATABASE_URL=postgresql://$USER@localhost:5432/vertical_express_demo \\\n" +
    "    DIRECT_URL=postgresql://$USER@localhost:5432/vertical_express_demo npx prisma ...\n\n" +
    "  For a deliberate, reviewed remote operation (staging migration after a backup):\n" +
    "    VE_ALLOW_REMOTE_DB=1 VE_EXPECTED_DB_REF=<staging ref> DIRECT_URL=<target> npx prisma ...\n\n"
  );
}

export function assertPrismaTargetAllowed(url, args, env) {
  const refusal = prismaTargetRefusal(url, args, env);
  if (refusal) {
    process.stderr.write(refusal);
    process.exit(1);
  }
}
