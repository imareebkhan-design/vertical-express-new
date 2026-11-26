import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getRequestId,
  getUserId,
  runWithContext,
  sanitizeMetadata,
  hashUserId,
  MetricsTracker,
  captureException,
  trackEvent,
  triggerAlert,
} from "../index";

test("Observability: sanitizeMetadata recursively masks sensitive fields and PII", () => {
  const payload = {
    password: "super-secret-password-123",
    otp: "123456",
    jwt: "header.payload.sig",
    cardNum: "1111-2222-3333-4444",
    email: "test@example.com",
    address: "123 Main St",
    normalField: "safe-data",
    nested: {
      secretToken: "abc-xyz",
      phone: "+919876543210",
      normalNested: 42,
    },
  };

  const sanitized = sanitizeMetadata(payload);
  assert.ok(sanitized);
  assert.equal(sanitized.password, "[MASKED]");
  assert.equal(sanitized.otp, "[MASKED]");
  assert.equal(sanitized.jwt, "[MASKED]");
  assert.equal(sanitized.cardNum, "[MASKED]");
  assert.equal(sanitized.email, "[MASKED]");
  assert.equal(sanitized.address, "[MASKED]");
  assert.equal(sanitized.normalField, "safe-data");

  const nested = sanitized.nested as Record<string, unknown>;
  assert.ok(nested);
  assert.equal(nested.secretToken, "[MASKED]");
  assert.equal(nested.phone, "[MASKED]");
  assert.equal(nested.normalNested, 42);
});

test("Observability: hashUserId creates consistent SHA256 hashes", () => {
  const id1 = "user-123";
  const id2 = "user-123";
  const id3 = "user-456";

  const hash1 = hashUserId(id1);
  const hash2 = hashUserId(id2);
  const hash3 = hashUserId(id3);

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  // Hashed ID is 64 characters hexadecimal
  assert.match(hash1, /^[a-f0-9]{64}$/);
});

test("Observability: AsyncLocalStorage propagates requestId and userId correctly", async () => {
  const reqId = "test-request-id-999";
  const usrId = "test-user-id-777";

  runWithContext({ requestId: reqId, userId: usrId }, () => {
    assert.equal(getRequestId(), reqId);
    assert.equal(getUserId(), usrId);

    // Verify propagation inside nested async chains
    setTimeout(() => {
      assert.equal(getRequestId(), reqId);
      assert.equal(getUserId(), usrId);
    }, 1);
  });

  // Verify outside context is undefined
  assert.equal(getRequestId(), undefined);
  assert.equal(getUserId(), undefined);
});

test("Observability: MetricsTracker calculates and reports durations", async () => {
  const tracker = new MetricsTracker("test-service");

  const DELAY_MS = 10;
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS));

  const duration = tracker.end("test_event", { meta: "test-data" });

  // Asserting `duration >= DELAY_MS` looks right and is flaky: setTimeout only
  // guarantees it fires no EARLIER than the delay on ITS clock, and the timer
  // and performance.now() do not share a resolution — 10ms routinely measures
  // as 9.98. That failed roughly half the time under load.
  //
  // What actually needs to hold is that the tracker measures real elapsed time
  // rather than returning zero or a constant, so allow one tick of slack and
  // pin a sane upper bound instead.
  assert.ok(duration >= DELAY_MS - 2, `expected ~${DELAY_MS}ms, measured ${duration}ms`);
  assert.ok(duration < 5000, `duration ${duration}ms is implausible`);
});

test("Observability: Sentry and PostHog capture does not fail when DSN/Key is missing", () => {
  // Capture exceptions and events when environment variables are missing
  // should run gracefully without throwing uncaught exceptions.
  assert.doesNotThrow(() => {
    captureException(new Error("Test error"), { someMeta: "value" });
  });

  assert.doesNotThrow(() => {
    trackEvent("test_analytics_event", { page: "/checkout" });
  });

  assert.doesNotThrow(() => {
    triggerAlert("database_connection_failure", "DB connection lost");
  });
});
