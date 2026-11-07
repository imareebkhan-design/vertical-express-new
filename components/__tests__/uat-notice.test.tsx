import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import { UatNotice } from "@/components/uat-notice";

/**
 * Client UAT, 8 Nov 2026 — the staging banner tells testers payments are
 * simulated and the returns policy is a DRAFT. It must never render on a
 * production backend, nor on a staging backend whose payment setup is not
 * consistently Razorpay TEST.
 */

const KEYS = ["VE_DEPLOY_ENV", "PAYMENT_GATEWAY", "ALLOW_TEST_GATEWAY", "RAZORPAY_KEY_ID"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) {
    if (values[k] === undefined) delete process.env[k];
    else process.env[k] = values[k];
  }
}

const STAGING = {
  VE_DEPLOY_ENV: "staging",
  PAYMENT_GATEWAY: "razorpay-test",
  ALLOW_TEST_GATEWAY: "1",
  RAZORPAY_KEY_ID: "rzp_test_example",
};

afterEach(() => {
  cleanup();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("staging with Razorpay TEST shows the testing notice and the DRAFT returns policy", () => {
  setEnv(STAGING);
  render(<UatNotice />);
  assert.ok(screen.getByLabelText("Client testing environment"));
  assert.match(document.body.textContent ?? "", /no real payments or deliveries/i);
  assert.match(document.body.textContent ?? "", /DRAFT — pending owner\/client approval/);
  assert.match(document.body.textContent ?? "", /defective, incorrect or non-conforming goods are not excluded/);
});

test("production never shows the testing notice", () => {
  setEnv({ ...STAGING, VE_DEPLOY_ENV: "production" });
  const { container } = render(<UatNotice />);
  assert.equal(container.textContent, "");
});

test("staging with a live key or without the test opt-in shows nothing", () => {
  for (const env of [
    { ...STAGING, RAZORPAY_KEY_ID: "rzp_live_example" },
    { ...STAGING, ALLOW_TEST_GATEWAY: undefined },
    { ...STAGING, PAYMENT_GATEWAY: "razorpay-live" },
  ]) {
    setEnv(env);
    const { container } = render(<UatNotice />);
    assert.equal(container.textContent, "");
    cleanup();
  }
});
