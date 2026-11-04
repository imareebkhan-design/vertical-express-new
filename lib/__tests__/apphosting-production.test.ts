import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { strictCatalogue } from "@/lib/deploy-env";

/**
 * Each backend runs apphosting.yaml (shared) with its environment file layered
 * on top: ve-staging → apphosting.staging.yaml, ve-production →
 * apphosting.production.yaml. An environment file can replace a value but not
 * remove one, so whatever is in the shared file reaches production. These
 * tests merge the files the way App Hosting does and check the result.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (name: string) => readFileSync(join(ROOT, name), "utf8");

type Entry = { value?: string; secret?: string; block: string };
function entries(yaml: string): Map<string, Entry> {
  const out = new Map<string, Entry>();
  for (const block of yaml.split(/\n\s*- variable: /).slice(1)) {
    const name = block.split("\n")[0].trim();
    const value = block.match(/\n\s+value: "?([^"\n]*)"?/)?.[1];
    const secret = block.match(/\n\s+secret: (\S+)/)?.[1];
    out.set(name, { value, secret, block });
  }
  return out;
}

const shared = entries(read("apphosting.yaml"));
const staging = entries(read("apphosting.staging.yaml"));
const production = entries(read("apphosting.production.yaml"));
const merged = new Map([...shared, ...production]);
const env = (name: string) => merged.get(name)?.value;

const PAYMENT_VARIABLES = [
  "PAYMENT_GATEWAY",
  "ALLOW_TEST_GATEWAY",
  "RAZORPAY_KEY_ID",
  "NEXT_PUBLIC_RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
];

test("the shared file carries nothing that differs between staging and production", () => {
  for (const name of [...PAYMENT_VARIABLES, "VE_DEPLOY_ENV", "COMMERCE_MODE", "NEXT_PUBLIC_SITE_URL", "DATABASE_URL", "CRON_SECRET"]) {
    assert.ok(!shared.has(name), `${name} must live in an environment file, not apphosting.yaml`);
  }
  for (const entry of [...shared.values(), ...staging.values(), ...production.values()]) {
    assert.notEqual(entry.value, "", "App Hosting rejects an empty value");
  }
});

test("production declares itself and trades in catalogue mode", () => {
  assert.equal(env("VE_DEPLOY_ENV"), "production");
  assert.equal(env("COMMERCE_MODE"), "catalogue");
  assert.equal(env("NEXT_PUBLIC_SITE_URL"), "https://www.verticalexpress.in");
  for (const name of ["VE_DEPLOY_ENV", "COMMERCE_MODE", "NEXT_PUBLIC_SITE_URL", "DATABASE_URL"]) {
    assert.match(production.get(name)!.block, /- BUILD/, `${name} must be available at BUILD`);
  }
});

test("production has no payment configuration at all", () => {
  for (const name of PAYMENT_VARIABLES) assert.ok(!merged.has(name), `${name} must not reach production`);
});

test("production reads its own database and cron secrets, never staging's", () => {
  assert.equal(merged.get("DATABASE_URL")?.secret, "database-url-production");
  assert.equal(merged.get("CRON_SECRET")?.secret, "cron-secret-production");
  for (const [name, entry] of merged) {
    if (entry.secret) assert.doesNotMatch(entry.secret, /staging/, `${name} reads a staging secret`);
  }
  assert.equal(staging.get("DATABASE_URL")?.secret, "database-url");
});

test("the merged production environment boots in catalogue mode with production catalogue rules", async () => {
  const productionEnv = { NODE_ENV: "production", VE_DEPLOY_ENV: env("VE_DEPLOY_ENV") };
  assert.equal(strictCatalogue(productionEnv), true);

  const saved = { ...process.env };
  try {
    for (const name of PAYMENT_VARIABLES) delete process.env[name];
    Object.assign(process.env, productionEnv, { COMMERCE_MODE: env("COMMERCE_MODE"), DATABASE_URL: "postgresql://x" });
    const { assertBootConfig } = await import("@/lib/services/payments");
    const { orderingOpen } = await import("@/lib/commerce-mode");
    assert.doesNotThrow(() => assertBootConfig());
    assert.equal(orderingOpen(), false);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("firebase.json deploys each backend by id, so a deploy names its target", () => {
  const config = JSON.parse(read("firebase.json")) as { apphosting: { backendId: string }[] };
  assert.deepEqual(config.apphosting.map((b) => b.backendId).sort(), ["ve-production", "ve-staging"]);
});
