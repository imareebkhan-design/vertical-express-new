import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  activeGateway,
  assertPaymentConfig,
  getPaymentProvider,
  PaymentConfigError,
} from "../payments";

/**
 * ISS-002 — the dummy payment provider must never be selected or run in
 * production, and a misconfigured production environment must fail loudly.
 */

const ENV_KEYS = [
  "NODE_ENV",
  "PAYMENT_GATEWAY",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
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
  // Clean baseline: no gateway configured.
  setEnv("PAYMENT_GATEWAY", "dummy");
  setEnv("RAZORPAY_KEY_ID", undefined);
  setEnv("RAZORPAY_KEY_SECRET", undefined);
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

test("production with keys present but PAYMENT_GATEWAY != razorpay still throws", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_GATEWAY", "dummy");
  setEnv("RAZORPAY_KEY_ID", "rzp_test_id");
  setEnv("RAZORPAY_KEY_SECRET", "super-secret-value");
  let message = "";
  try {
    activeGateway();
    assert.fail("expected activeGateway() to throw");
  } catch (e) {
    assert.ok(e instanceof PaymentConfigError);
    message = e.message;
  }
  // Never leak the secret value in the error message.
  assert.ok(!message.includes("super-secret-value"));
});

test("production with Razorpay fully configured returns razorpay", () => {
  setEnv("NODE_ENV", "production");
  setEnv("PAYMENT_GATEWAY", "razorpay");
  setEnv("RAZORPAY_KEY_ID", "rzp_test_id");
  setEnv("RAZORPAY_KEY_SECRET", "secret");
  assert.equal(activeGateway(), "razorpay");
});

test("assertPaymentConfig throws in a misconfigured production environment", () => {
  setEnv("NODE_ENV", "production");
  assert.throws(() => assertPaymentConfig(), PaymentConfigError);
});

test("assertPaymentConfig does not throw in development", () => {
  setEnv("NODE_ENV", "development");
  assert.doesNotThrow(() => assertPaymentConfig());
});

test("dummy provider refuses to create a payment in production", async () => {
  setEnv("NODE_ENV", "production");
  const provider = getPaymentProvider("dummy");
  await assert.rejects(
    () => provider.createPayment({ orderId: "order_123", amountPaise: 1000 }),
    PaymentConfigError
  );
});

test("dummy provider settles instantly in development", async () => {
  setEnv("NODE_ENV", "development");
  const provider = getPaymentProvider("dummy");
  const res = await provider.createPayment({ orderId: "order_123", amountPaise: 1000 });
  assert.equal(res.settled, true);
});
