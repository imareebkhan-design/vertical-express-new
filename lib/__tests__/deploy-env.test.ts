import test from "node:test";
import assert from "node:assert/strict";
import { deployEnvProblem, strictCatalogue, type Env } from "@/lib/deploy-env";

/**
 * The production catalogue rules (ISS-093: attested image licences only, no QA
 * fixture) must fail CLOSED. Only plain local development and a staging backend
 * whose payments are consistently test-only may relax them.
 */

const STAGING: Env = {
  NODE_ENV: "production", VE_DEPLOY_ENV: "staging",
  PAYMENT_GATEWAY: "razorpay-test", ALLOW_TEST_GATEWAY: "1", RAZORPAY_KEY_ID: "rzp_test_abc",
};
const PRODUCTION: Env = {
  NODE_ENV: "production", VE_DEPLOY_ENV: "production",
  PAYMENT_GATEWAY: "razorpay-live", RAZORPAY_KEY_ID: "rzp_live_abc",
};

test("staging, declared and consistent: relaxed, and preflight is satisfied", () => {
  assert.equal(strictCatalogue(STAGING), false);
  assert.equal(deployEnvProblem(STAGING), null);
});

test("production, declared with live payments: strict, and preflight is satisfied", () => {
  assert.equal(strictCatalogue(PRODUCTION), true);
  assert.equal(deployEnvProblem(PRODUCTION), null);
});

test("live payments are strict whatever the declaration says", () => {
  for (const VE_DEPLOY_ENV of ["staging", "development", undefined, "anything"]) {
    assert.equal(strictCatalogue({ ...STAGING, VE_DEPLOY_ENV, PAYMENT_GATEWAY: "razorpay-live" }), true, String(VE_DEPLOY_ENV));
  }
});

test("declared production stays strict even with a test gateway, and preflight flags it", () => {
  const env = { ...PRODUCTION, PAYMENT_GATEWAY: "razorpay-test", ALLOW_TEST_GATEWAY: "1", RAZORPAY_KEY_ID: "rzp_test_abc" };
  assert.equal(strictCatalogue(env), true);
  assert.match(deployEnvProblem(env) ?? "", /production but PAYMENT_GATEWAY is not razorpay-live/);
});

test("declared staging with a contradictory payment setup fails closed", () => {
  const contradictions: Env[] = [
    { ...STAGING, ALLOW_TEST_GATEWAY: undefined },          // test gateway without the opt-in
    { ...STAGING, RAZORPAY_KEY_ID: "rzp_live_abc" },          // a live key on "staging"
    { ...STAGING, PAYMENT_GATEWAY: "dummy" },                 // no real gateway at all
    { ...STAGING, PAYMENT_GATEWAY: undefined },               // missing gateway
  ];
  for (const env of contradictions) {
    assert.equal(strictCatalogue(env), true, JSON.stringify(env));
    assert.ok(deployEnvProblem(env), "preflight reports it");
  }
});

test("an undeclared deployed backend (NODE_ENV=production) is strict; preflight says so", () => {
  const env = { ...STAGING, VE_DEPLOY_ENV: undefined };
  assert.equal(strictCatalogue(env), true);
  assert.equal(strictCatalogue({ ...env, VE_DEPLOY_ENV: "" }), true);
  assert.match(deployEnvProblem(env) ?? "", /not set/);
});

test("an unknown declaration is strict, never permission to relax", () => {
  const env = { ...STAGING, VE_DEPLOY_ENV: "prod" };
  assert.equal(strictCatalogue(env), true);
  assert.match(deployEnvProblem(env) ?? "", /not one of/);
});

test("development is relaxed only outside a production build", () => {
  assert.equal(strictCatalogue({ VE_DEPLOY_ENV: "development", NODE_ENV: "development" }), false);
  const deployed = { VE_DEPLOY_ENV: "development", NODE_ENV: "production" };
  assert.equal(strictCatalogue(deployed), true);
  assert.match(deployEnvProblem(deployed) ?? "", /development on a NODE_ENV=production/);
});

test("local development and the test runner (nothing declared, not a production build) stay relaxed", () => {
  assert.equal(strictCatalogue({}), false);
  assert.equal(strictCatalogue({ NODE_ENV: "test" }), false);
  assert.equal(strictCatalogue({ NODE_ENV: "development", PAYMENT_GATEWAY: "dummy" }), false);
});

test("the staging backend's own config declares itself consistently", async () => {
  /* apphosting.yaml is the staging backend. If it ever stops declaring staging
     consistently, its catalogue would silently switch to production rules. */
  const { readFileSync } = await import("node:fs");
  const yaml = readFileSync(new URL("../../apphosting.yaml", import.meta.url), "utf8");
  const value = (name: string) => yaml.match(new RegExp(`variable: ${name}\\n\\s+value: "?([^"\\n]+)"?`))?.[1];
  const env: Env = {
    NODE_ENV: "production",
    VE_DEPLOY_ENV: value("VE_DEPLOY_ENV"),
    PAYMENT_GATEWAY: value("PAYMENT_GATEWAY"),
    ALLOW_TEST_GATEWAY: value("ALLOW_TEST_GATEWAY"),
    RAZORPAY_KEY_ID: value("RAZORPAY_KEY_ID"),
  };
  assert.equal(env.VE_DEPLOY_ENV, "staging");
  assert.equal(deployEnvProblem(env), null);
  assert.equal(strictCatalogue(env), false);
  /* Available at BUILD too: static pages query the catalogue while building. */
  for (const name of ["VE_DEPLOY_ENV", "PAYMENT_GATEWAY", "ALLOW_TEST_GATEWAY", "RAZORPAY_KEY_ID"]) {
    const block = yaml.slice(yaml.indexOf(`variable: ${name}\n`)).split("- variable:")[0];
    assert.match(block, /- BUILD/, `${name} must be available at BUILD`);
  }
});
