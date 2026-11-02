import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { strictCatalogue } from "@/lib/deploy-env";

/**
 * The production backend (ve-production) runs apphosting.yaml — the STAGING
 * config — with apphosting.production.yaml layered on top. Anything the
 * production file does not name is inherited from staging, so these tests
 * merge the two the way App Hosting does and check the result.
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

const staging = entries(read("apphosting.yaml"));
const production = entries(read("apphosting.production.yaml"));
const merged = new Map([...staging, ...production]);
const env = (name: string) => merged.get(name)?.value;

test("production declares itself and trades in catalogue mode", () => {
  assert.equal(env("VE_DEPLOY_ENV"), "production");
  assert.equal(env("COMMERCE_MODE"), "catalogue");
  assert.equal(env("NEXT_PUBLIC_SITE_URL"), "https://www.verticalexpress.in");
  for (const name of ["VE_DEPLOY_ENV", "COMMERCE_MODE", "NEXT_PUBLIC_SITE_URL"]) {
    assert.match(production.get(name)!.block, /- BUILD/, `${name} must be available at BUILD`);
  }
});

test("no staging payment configuration survives the merge", () => {
  for (const name of [
    "PAYMENT_GATEWAY",
    "ALLOW_TEST_GATEWAY",
    "RAZORPAY_KEY_ID",
    "NEXT_PUBLIC_RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
  ]) {
    const entry = merged.get(name);
    assert.ok(entry, `${name} must be overridden explicitly`);
    assert.equal(entry.value, "", `${name} must be empty in production`);
    assert.equal(entry.secret, undefined, `${name} must not read a staging secret`);
  }
});

test("production reads its own database and cron secrets, never staging's", () => {
  assert.equal(merged.get("DATABASE_URL")?.secret, "database-url-production");
  assert.match(production.get("DATABASE_URL")!.block, /- BUILD/, "static pages query the catalogue at build");
  assert.equal(merged.get("CRON_SECRET")?.secret, "cron-secret-production");
  assert.notEqual(merged.get("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY")?.secret, "google-maps-browser-key-staging");
});

test("the merged environment boots in catalogue mode and applies production catalogue rules", async () => {
  const merged_env = {
    NODE_ENV: "production",
    VE_DEPLOY_ENV: env("VE_DEPLOY_ENV"),
    PAYMENT_GATEWAY: env("PAYMENT_GATEWAY"),
    ALLOW_TEST_GATEWAY: env("ALLOW_TEST_GATEWAY"),
    RAZORPAY_KEY_ID: env("RAZORPAY_KEY_ID"),
  };
  assert.equal(strictCatalogue(merged_env), true);

  const saved = { ...process.env };
  try {
    Object.assign(process.env, merged_env, { COMMERCE_MODE: env("COMMERCE_MODE"), DATABASE_URL: "postgresql://x" });
    const { assertBootConfig } = await import("@/lib/services/payments");
    const { orderingOpen } = await import("@/lib/commerce-mode");
    assert.doesNotThrow(() => assertBootConfig());
    assert.equal(orderingOpen(), false);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("firebase.json deploys each backend by id, so a staging deploy names its target", () => {
  const config = JSON.parse(read("firebase.json")) as { apphosting: { backendId: string }[] };
  assert.deepEqual(config.apphosting.map((b) => b.backendId).sort(), ["ve-production", "ve-staging"]);
});
