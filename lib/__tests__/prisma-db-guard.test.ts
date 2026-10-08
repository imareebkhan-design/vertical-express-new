import { test } from "node:test";
import assert from "node:assert/strict";
import { prismaTargetRefusal } from "../../scripts/prisma-db-guard.mjs";

const PROD = "postgresql://postgres.ref:pw@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";
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

test("explicit VE_ALLOW_REMOTE_DB=1 allows a deliberate remote operation", () => {
  assert.equal(prismaTargetRefusal(PROD, ["migrate", "deploy"], { VE_ALLOW_REMOTE_DB: "1" }), null);
  assert.ok(prismaTargetRefusal(PROD, ["migrate", "deploy"], { VE_ALLOW_REMOTE_DB: "true" }));
});
