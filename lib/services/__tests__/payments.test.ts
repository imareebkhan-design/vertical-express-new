import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  activeGateway,
  assertPaymentConfig,
  getPaymentProvider,
  PaymentConfigError,
} from "../payments";

/**
 * Closed Beta & Production Readiness tests for unified PaymentProvider interfaces.
 */

const ENV_KEYS = [
  "NODE_ENV",
  "PAYMENT_GATEWAY",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "DATABASE_URL",
  "ALLOW_TEST_GATEWAY",
  "NEXT_PUBLIC_RAZORPAY_KEY_ID",
] as const;

type MutableEnv = Record<string, string | undefined>;

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete (process.env as MutableEnv)[key];
  else (process.env as MutableEnv)[key] = value;
}

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  // Baseline configuration
  setEnv("PAYMENT_GATEWAY", "dummy");
  setEnv("DATABASE_URL", "postgresql://localhost:5432/db");
  setEnv("RAZORPAY_KEY_ID", undefined);
  setEnv("RAZORPAY_KEY_SECRET", undefined);
  setEnv("RAZORPAY_WEBHOOK_SECRET", undefined);
  setEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", undefined);
});

afterEach(() => {
  for (const k of ENV_KEYS) setEnv(k, saved[k]);
});

test("development returns the dummy gateway when Razorpay is not configured", () => {
  setEnv("NODE_ENV", "development");
  assert.equal(activeGateway(), "dummy");
});

test("production without Razorpay keys throws PaymentConfigError", () => {
  setEnv("NODE_ENV", "production");
  assert.throws(() => activeGateway(), PaymentConfigError);
});

test("production with keys present but PAYMENT_GATEWAY = dummy still throws", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_GATEWAY", "dummy");
  setEnv("RAZORPAY_KEY_ID", "rzp_test_id");
  setEnv("RAZORPAY_KEY_SECRET", "super-secret-value");
  assert.throws(() => activeGateway(), PaymentConfigError);
});

test("production with keys present but PAYMENT_GATEWAY = razorpay-test still throws", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_GATEWAY", "razorpay-test");
  setEnv("RAZORPAY_KEY_ID", "rzp_test_id");
  setEnv("RAZORPAY_KEY_SECRET", "super-secret-value");
  assert.throws(() => activeGateway(), PaymentConfigError);
});

test("production with Razorpay fully configured in live mode succeeds", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_GATEWAY", "razorpay-live");
  setEnv("RAZORPAY_KEY_ID", "rzp_live_id");
  setEnv("RAZORPAY_KEY_SECRET", "secret");
  setEnv("RAZORPAY_WEBHOOK_SECRET", "webhook_secret");
  assert.equal(activeGateway(), "razorpay-live");
});

test("assertPaymentConfig throws in a misconfigured production environment", () => {
  setEnv("NODE_ENV", "production");
  assert.throws(() => assertPaymentConfig(), PaymentConfigError);
});

test("assertPaymentConfig throws if DATABASE_URL is missing", () => {
  setEnv("NODE_ENV", "development");
  setEnv("DATABASE_URL", undefined);
  assert.throws(() => assertPaymentConfig(), PaymentConfigError);
});

test("assertPaymentConfig does not throw in development with dummy", () => {
  setEnv("NODE_ENV", "development");
  assert.doesNotThrow(() => assertPaymentConfig());
});

test("dummy provider refuses to resolve or create an order in production", () => {
  setEnv("NODE_ENV", "production");
  assert.throws(
    () => getPaymentProvider("dummy"),
    PaymentConfigError
  );
});

test("dummy provider settles instantly in development", async () => {
  setEnv("NODE_ENV", "development");
  const provider = getPaymentProvider("dummy");
  const res = await provider.createOrder({ orderId: "order_123", amountPaise: 1000 });
  assert.equal(res.settled, true);
  assert.ok(res.gatewayOrderId?.startsWith("dummy_"));
});

test("dummy provider verify methods succeed in development but throw in production", () => {
  setEnv("NODE_ENV", "development");
  const provider = getPaymentProvider("dummy");
  assert.equal(provider.verifyPayment({}), true);
  assert.equal(provider.verifyWebhook("body", "signature"), true);

  setEnv("NODE_ENV", "production");
  assert.throws(() => provider.verifyPayment({}), PaymentConfigError);
  assert.throws(() => provider.verifyWebhook("body", "signature"), PaymentConfigError);
});

test("provider selection resolves appropriate classes based on gateway environment config", () => {
  setEnv("NODE_ENV", "development");
  
  setEnv("PAYMENT_GATEWAY", "dummy");
  const dummyProv = getPaymentProvider("dummy");
  assert.equal(dummyProv.id, "dummy");

  setEnv("PAYMENT_GATEWAY", "razorpay-test");
  setEnv("RAZORPAY_KEY_ID", "test_id");
  setEnv("RAZORPAY_KEY_SECRET", "test_secret");
  const testProv = getPaymentProvider("razorpay");
  assert.equal(testProv.id, "razorpay-test");
});

/* ---- a staging backend on a production runtime (Firebase App Hosting, Cloud Run) ---- */

test("staging opt-in: production + ALLOW_TEST_GATEWAY=1 + rzp_test_ keys runs the test gateway", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_GATEWAY", "razorpay-test");
  setEnv("ALLOW_TEST_GATEWAY", "1");
  setEnv("RAZORPAY_KEY_ID", "rzp_test_abc123");
  setEnv("RAZORPAY_KEY_SECRET", "secret");
  assert.equal(activeGateway(), "razorpay-test");
  assert.doesNotThrow(() => assertPaymentConfig());
});

test("staging opt-in never admits a LIVE key under the test gateway", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_GATEWAY", "razorpay-test");
  setEnv("ALLOW_TEST_GATEWAY", "1");
  setEnv("RAZORPAY_KEY_ID", "rzp_live_abc123");
  setEnv("RAZORPAY_KEY_SECRET", "secret");
  assert.throws(() => activeGateway(), PaymentConfigError);
});

test("staging opt-in needs the flag: test keys alone are not enough in production", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_GATEWAY", "razorpay-test");
  setEnv("RAZORPAY_KEY_ID", "rzp_test_abc123");
  setEnv("RAZORPAY_KEY_SECRET", "secret");
  assert.throws(() => activeGateway(), PaymentConfigError);
  setEnv("ALLOW_TEST_GATEWAY", "true"); // only the exact string "1" counts
  assert.throws(() => activeGateway(), PaymentConfigError);
});

test("the opt-in does not touch the dummy gateway, which stays forbidden in production", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_GATEWAY", "dummy");
  setEnv("ALLOW_TEST_GATEWAY", "1");
  setEnv("RAZORPAY_KEY_ID", "rzp_test_abc123");
  assert.throws(() => activeGateway(), PaymentConfigError);
});

/* A production backend whose environment file switches to live mode but still
   inherits the staging key ids from apphosting.yaml would take "payments" in
   Razorpay TEST mode — orders confirmed, no money collected (the ISS-002 class).
   Live mode therefore refuses to start on anything but live key ids. */
function liveEnv() {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_GATEWAY", "razorpay-live");
  setEnv("RAZORPAY_KEY_ID", "rzp_live_abc123");
  setEnv("RAZORPAY_KEY_SECRET", "secret");
  setEnv("RAZORPAY_WEBHOOK_SECRET", "webhook_secret");
}

test("live mode refuses a TEST key id (inherited staging config)", () => {
  liveEnv();
  setEnv("RAZORPAY_KEY_ID", "rzp_test_abc123");
  assert.throws(() => activeGateway(), PaymentConfigError);
  assert.throws(() => assertPaymentConfig(), PaymentConfigError);
});

test("live mode refuses a browser key id that is not the server's live key", () => {
  liveEnv();
  setEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_abc123");
  assert.throws(() => assertPaymentConfig(), PaymentConfigError);
  setEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_live_other");
  assert.throws(() => assertPaymentConfig(), PaymentConfigError);
});

test("live mode with live key ids (browser id equal or unset) starts", () => {
  liveEnv();
  assert.doesNotThrow(() => assertPaymentConfig());
  setEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_live_abc123");
  assert.doesNotThrow(() => assertPaymentConfig());
});
