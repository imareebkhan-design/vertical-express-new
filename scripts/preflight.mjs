#!/usr/bin/env node
/**
 * Preflight — is this environment ready to serve?
 *
 * WHY THIS EXISTS
 *
 * Nothing in this repository checked an environment before now.
 * `assertPaymentConfig()` throws at boot, but only about payments.
 * `predeploy-migrations.mjs` checks migrations, and only migrations. Firebase,
 * the admin allowlist, the canonical host and whether the catalogue is still
 * fictional were checked by nobody, and each of them fails in a different
 * place at a different time:
 *
 *   Razorpay missing        → every request 500s, immediately and obviously
 *   Firebase missing        → the site serves, and nobody can sign in
 *   FIREBASE_PRIVATE_KEY
 *     pasted without its
 *     newlines              → the site serves, sign-in looks fine, and every
 *                             session verification fails at request time
 *   Catalogue still seeded  → the site serves, and sells invented products
 *
 * The last three all look like a successful deploy. This is the thing that
 * says otherwise, before the deploy rather than after it.
 *
 * WHAT IT NEVER DOES
 *
 * It never prints a secret. Every check reports presence and shape only — that
 * a key exists, that a PEM parses, that two project ids agree — never a value.
 * It writes nothing to any database.
 *
 *     npm run preflight                    # against whatever is in .env
 *     npm run preflight -- --env .env.production
 *
 * Exits non-zero if anything in the first two tiers fails. The third tier
 * warns: those are things that serve, wrongly.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@/prisma/generated/client/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/* ---------------------------------------------------------------- */
/* env loading                                                       */
/* ---------------------------------------------------------------- */

const args = process.argv.slice(2);
const envArg = args.indexOf("--env");
if (envArg !== -1 && args[envArg + 1]) {
  const file = args[envArg + 1];
  if (!existsSync(file)) {
    console.error(`\n✗ preflight: no such env file: ${file}\n`);
    process.exit(1);
  }
  /* Parsed here rather than with dotenv's side effects so an explicit file
     wins over whatever is already in the process. */
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[m[1]] = value;
  }
  console.log(`  (loaded ${file})\n`);
}

/* ---------------------------------------------------------------- */
/* reporting                                                         */
/* ---------------------------------------------------------------- */

const fatal = [];
const warned = [];
let currentTier = "";

const tier = (name) => {
  currentTier = name;
  console.log(`\n${name}`);
  console.log("─".repeat(name.length));
};

/** A check that must pass for the environment to work. */
function must(label, ok, remedy) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) fatal.push({ tier: currentTier, label, remedy });
  return ok;
}

/** A check that serves either way, but is wrong one way. */
function should(label, ok, remedy) {
  console.log(`  ${ok ? "✓" : "!"} ${label}`);
  if (!ok) warned.push({ tier: currentTier, label, remedy });
  return ok;
}

const present = (name) => {
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "";
};

/* ---------------------------------------------------------------- */

console.log("\nVertical Express — preflight");
console.log("════════════════════════════");

/* ── 1. Will not boot ───────────────────────────────────────────── */

tier("Will not boot without these");

const hasDbUrl = must(
  "DATABASE_URL is set",
  present("DATABASE_URL"),
  "Set DATABASE_URL. assertPaymentConfig() throws at boot without it, so every request 500s."
);

/* The gateway rules live in lib/services/payments.ts; this mirrors them rather
   than importing, because importing pulls in `server-only`. If they drift, the
   boot assertion is the one that is right. */
const gateway = (process.env.PAYMENT_GATEWAY ?? "").trim();
must(
  `PAYMENT_GATEWAY is a valid gateway${gateway ? ` ("${gateway}")` : ""}`,
  ["dummy", "razorpay-test", "razorpay-live"].includes(gateway),
  'Set PAYMENT_GATEWAY to one of: dummy, razorpay-test, razorpay-live. Production must be "razorpay-live".'
);

if (gateway === "razorpay-live") {
  for (const key of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) {
    must(
      `${key} is set`,
      present(key),
      `Set ${key} in Vercel. Production refuses to boot on razorpay-live without all three.`
    );
  }
} else {
  should(
    "PAYMENT_GATEWAY is razorpay-live",
    false,
    `The gateway is "${gateway || "unset"}". The dummy gateway confirms orders with no money taken (ISS-002). ` +
      "Production must be razorpay-live."
  );
}

/* ── 2. Nobody can sign in ──────────────────────────────────────── */

tier("Nobody can sign in without these");

const CLIENT_VARS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];
const missingClient = CLIENT_VARS.filter((v) => !present(v));
must(
  `all ${CLIENT_VARS.length} browser Firebase variables are set`,
  missingClient.length === 0,
  missingClient.length
    ? `Missing: ${missingClient.join(", ")}. Without these the sign-in form cannot reach Firebase at all (ISS-053).`
    : ""
);

/* Each credential may be supplied as FB_ADMIN_* (required on Firebase App Hosting,
   which reserves the FIREBASE_ prefix) or under the original FIREBASE_* name. */
const ADMIN_VARS = ["PROJECT_ID", "CLIENT_EMAIL", "PRIVATE_KEY"];
const adminVal = (n) => process.env["FB_ADMIN_" + n] ?? process.env["FIREBASE_" + n];
const missingAdmin = ADMIN_VARS.filter((n) => !(adminVal(n) && adminVal(n).trim() !== "")).map((n) => "FB_ADMIN_" + n + " (or FIREBASE_" + n + ")");
must(
  "the 3 server Firebase credentials are set",
  missingAdmin.length === 0,
  missingAdmin.length
    ? `Missing: ${missingAdmin.join(", ")}. lib/auth/firebase-admin.ts refuses to verify any session without them.`
    : ""
);

/* The failure this whole script most earns its keep on. A private key pasted
   into a dashboard field usually survives as the two characters \n rather than
   real newlines. Boot is fine, the sign-in form is fine, and every session
   verification then fails at request time with a PEM error that says nothing
   about newlines. */
if (adminVal("PRIVATE_KEY")) {
  const key = adminVal("PRIVATE_KEY").replace(/\\n/g, "\n");
  const looksLikePem =
    key.includes("-----BEGIN") && key.includes("-----END") && key.split("\n").length > 3;
  must(
    "FIREBASE_PRIVATE_KEY parses as a PEM once newlines are restored",
    looksLikePem,
    "The key is set but does not look like a PEM after unescaping. It was probably pasted without its " +
      "line breaks. Re-paste it, keeping the BEGIN/END lines and the newlines between them."
  );
}

/* Two project ids for one project, and nothing compares them. A mismatch
   authenticates against one Firebase project and verifies against another, so
   every sign-in fails with a token that looks valid. */
if (present("FIREBASE_PROJECT_ID") && present("NEXT_PUBLIC_FIREBASE_PROJECT_ID")) {
  must(
    "the browser and server Firebase project ids match",
    process.env.FIREBASE_PROJECT_ID.trim() === process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID.trim(),
    "FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_PROJECT_ID name different projects. Sign-in would " +
      "issue a token from one and verify it against the other."
  );
}

const admins = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);
must(
  `ADMIN_EMAILS names at least one operator${admins.length ? ` (${admins.length})` : ""}`,
  admins.length > 0,
  "Set ADMIN_EMAILS. With it empty nobody can open the console — including to enter the catalogue."
);
if (admins.length > 0) {
  should(
    "every ADMIN_EMAILS entry looks like an email address",
    admins.every((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)),
    "One of the entries is not an email address. The allowlist compares exact lowercased addresses, " +
      "so a malformed one silently matches nobody."
  );
}

/* ── 3. Serves, but wrong ───────────────────────────────────────── */

tier("Will serve, but wrong");

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
should(
  "NEXT_PUBLIC_SITE_URL is an absolute URL",
  /^https?:\/\/.+/.test(siteUrl),
  "Unset or relative. Canonical tags and the sitemap emit the wrong host, which tells search engines " +
    "the wrong address for every page (ISS-018)."
);

should(
  "SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN is set",
  present("SENTRY_DSN") || present("NEXT_PUBLIC_SENTRY_DSN"),
  "Sentry is wired but has no DSN, so nothing reports an error in production (ISS-012)."
);

/* ---------------------------------------------------------------- */
/* database                                                          */
/* ---------------------------------------------------------------- */

let db = null;
if (hasDbUrl) {
  tier("The database");

  /* Name the target, host and database only, never the credentials.
   *
   * The first version of this script answered about production while claiming
   * to check a local environment, because the subprocess it used loaded `.env`
   * behind its back. The check no longer does that — but "which database did
   * this actually ask?" should never again be a question a reader has to work
   * out, so it is stated. */
  try {
    const u = new URL(process.env.DATABASE_URL);
    const target = `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
    const managed = /supabase|neon|rds\.amazonaws|render|railway/i.test(u.hostname);
    console.log(`  → checking ${target}${managed ? "   ⚠ THIS IS A MANAGED HOST" : ""}`);
  } catch {
    console.log("  → checking the database in DATABASE_URL (unparseable as a URL)");
  }

  let reachable = false;
  try {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    db = new PrismaClient({ adapter });
    await db.$queryRaw`SELECT 1`;
    reachable = true;
  } catch (err) {
    /* The message can carry the connection string. Only the class of failure
       is printed. */
    void err;
  }
  must(
    "the database is reachable",
    reachable,
    "Could not connect using DATABASE_URL. Check the host, the password and whether the IP is allowed."
  );

  if (reachable) {
    /* Asked of THIS database, by reading its own ledger.
     *
     * The obvious implementation — shelling out to `npx prisma migrate status`
     * — is wrong here, and wrong in a way that makes the whole script
     * dangerous. `prisma.config.ts` does `import "dotenv/config"` and resolves
     * `DIRECT_URL ?? DATABASE_URL`, so the subprocess loads `.env` and the
     * DIRECT_URL in it wins over whatever environment is being checked. The
     * first version of this script reported production's migration state no
     * matter which environment you pointed it at: "5 pending" against a
     * database that was fully migrated. A preflight that answers about the
     * wrong database is worse than no preflight.
     *
     * So: compare the migration folders on disk against the `_prisma_migrations`
     * table in the connection under test. No subprocess, no config file, no
     * ambiguity about which database answered. */
    const onDisk = readdirSync(join(ROOT, "prisma/migrations"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    let applied = null;
    try {
      const rows = await db.$queryRaw`
        SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
      `;
      applied = new Set(rows.map((r) => r.migration_name));
    } catch {
      /* No ledger table at all — an empty database. Everything is pending. */
      applied = new Set();
    }

    const pending = onDisk.filter((name) => !applied.has(name));
    must(
      pending.length === 0
        ? `the schema matches this build (${onDisk.length} migrations applied)`
        : `the schema matches this build (${pending.length} of ${onDisk.length} pending)`,
      pending.length === 0,
      pending.length
        ? `Pending: ${pending.join(", ")}.\n      Apply them deliberately with \`npm run db:deploy\`, ` +
          "while you are watching. The build refuses to run until they are applied (ISS-024)."
        : ""
    );

    /* --- what is actually in the catalogue --- */
    const SEEDED_BRANDS = [
      "BuildPro", "AquaSeal", "Voltix", "TimberCraft", "GripFast",
      "LumenX", "SteelEdge", "FlowMax", "HomeCrown", "PowerCell",
    ];

    const [fictional, published, warehouses, pincodes, expressFee] = await Promise.all([
      db.product.count({ where: { brand: { name: { in: SEEDED_BRANDS } } } }),
      db.product.count({ where: { status: "published" } }),
      db.warehouse.count({ where: { isActive: true } }),
      db.serviceablePincode.count({ where: { isActive: true } }),
      db.setting.findUnique({ where: { key: "delivery.express_fee_paise" } }).catch(() => null),
    ]);

    should(
      `no product is listed under an invented brand${fictional ? ` (${fictional} are)` : ""}`,
      fictional === 0,
      `${fictional} products still belong to the seeded brands (${SEEDED_BRANDS.slice(0, 3).join(", ")}…). ` +
        "Selling these is ISS-007. Import the real catalogue at /admin/listing."
    );

    should(
      `something is published (${published})`,
      published > 0,
      "No published products. The storefront has nothing to sell."
    );

    must(
      `at least one active warehouse (${warehouses})`,
      warehouses > 0,
      "No active warehouse. Stock cannot be held and an order cannot be fulfilled."
    );

    must(
      `at least one serviceable pincode (${pincodes})`,
      pincodes > 0,
      "No serviceable pincode. Checkout refuses every address."
    );

    should(
      "the express delivery charge is set",
      expressFee !== null && expressFee !== undefined,
      "delivery.express_fee_paise is unset, so 60-minute delivery cannot be offered at all — the " +
        "feature is built and inert. Set it in /admin/settings."
    );
  }
}

/* ---------------------------------------------------------------- */
/* report                                                            */
/* ---------------------------------------------------------------- */

if (db) await db.$disconnect();

console.log("");
if (fatal.length === 0 && warned.length === 0) {
  console.log("✓ preflight: this environment is ready to serve\n");
  process.exit(0);
}

if (warned.length > 0) {
  console.log(`! ${warned.length} thing${warned.length > 1 ? "s" : ""} would serve, wrongly:\n`);
  for (const w of warned) console.log(`  • ${w.label}\n      ${w.remedy}\n`);
}

if (fatal.length > 0) {
  console.error(`✗ preflight: ${fatal.length} blocking problem${fatal.length > 1 ? "s" : ""}:\n`);
  for (const f of fatal) console.error(`  • ${f.label}\n      ${f.remedy}\n`);
  process.exit(1);
}

console.log("✓ preflight: nothing blocking. The warnings above are worth reading.\n");
process.exit(0);
