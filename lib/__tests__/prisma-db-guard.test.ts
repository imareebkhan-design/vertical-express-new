import { test } from "node:test";
import assert from "node:assert/strict";
import { prismaTargetRefusal, supabaseRef } from "../../scripts/prisma-db-guard.mjs";

const PROD_REF = "gsfslnxvwmrgulzqypdp";
const STAGING_REF = "gjhxhmcsuhxcmrvtkggz";
const PROD = `postgresql://postgres.${PROD_REF}:pw@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`;
const STAGING = `postgresql://postgres.${STAGING_REF}:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;
const LOCAL = "postgresql://me@localhost:5432/vertical_express_demo";

test("refuses DB-touching Prisma commands against a remote host by default", () => {
  for (const args of [["migrate", "dev"], ["migrate", "deploy"], ["migrate", "status"], ["db", "seed"], ["db", "push"], ["studio"]]) {
    const msg = prismaTargetRefusal(PROD, args, {});
    assert.ok(msg, `expected refusal for prisma ${args.join(" ")}`);
    assert.ok(!msg.includes("pw@"), "must never print the credential");
  }
});

test("offline commands pass so cloud builds can run prisma generate", () => {
  for (const args of [["generate"], ["validate"], ["format"], ["--version"]]) {
    assert.equal(prismaTargetRefusal(PROD, args, {}), null);
  }
});

test("localhost is allowed", () => {
  assert.equal(prismaTargetRefusal(LOCAL, ["migrate", "deploy"], {}), null);
});

test("parses the project ref from pooler and direct URLs", () => {
  assert.equal(supabaseRef(STAGING), STAGING_REF);
  assert.equal(supabaseRef(`postgresql://postgres:pw@db.${STAGING_REF}.supabase.co:5432/postgres`), STAGING_REF);
  assert.equal(supabaseRef("postgresql://u:p@example.com/db"), null);
});

test("VE_ALLOW_REMOTE_DB=1 alone is not enough: the expected ref is required", () => {
  assert.match(prismaTargetRefusal(STAGING, ["migrate", "deploy"], { VE_ALLOW_REMOTE_DB: "1" }) ?? "", /VE_EXPECTED_DB_REF is required/);
  assert.ok(prismaTargetRefusal(STAGING, ["migrate", "deploy"], { VE_ALLOW_REMOTE_DB: "true", VE_EXPECTED_DB_REF: STAGING_REF }));
});

test("staging passes only when the URL really is staging", () => {
  const env = { VE_ALLOW_REMOTE_DB: "1", VE_EXPECTED_DB_REF: STAGING_REF };
  assert.equal(prismaTargetRefusal(STAGING, ["migrate", "deploy"], env), null);
  // The accident this exists for: staging intended, production URL still loaded from .env.
  assert.match(prismaTargetRefusal(PROD, ["migrate", "deploy"], env) ?? "", /target mismatch/);
});

test("production needs its own explicit confirmation even when named", () => {
  const env = { VE_ALLOW_REMOTE_DB: "1", VE_EXPECTED_DB_REF: PROD_REF };
  assert.match(prismaTargetRefusal(PROD, ["migrate", "deploy"], env) ?? "", /PRODUCTION/);
  assert.equal(prismaTargetRefusal(PROD, ["migrate", "deploy"], { ...env, VE_CONFIRM_PRODUCTION_DB: PROD_REF }), null);
});
