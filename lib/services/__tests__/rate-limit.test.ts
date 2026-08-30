/**
 * ISS-021 — the OTP rate limiter must fail CLOSED.
 * ISS-027 — the limiter must be atomic under concurrency.
 *
 * Both defects were invisible to the previous suite because the limiter had no
 * tests at all. The concurrency test below is the one that matters: it fails
 * against the old `findUnique` -> `update` implementation, which let two callers
 * read the same `hits` and both proceed.
 *
 * `db.$queryRaw` is monkey-patched to simulate an unreachable limiter table,
 * matching the probe style already used in `checkout-transaction.test.ts`.
 */

import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { rateLimit } from "../rate-limit";

const buckets: string[] = [];

/** A bucket name unique to one test, registered for cleanup. */
function freshBucket(label: string): string {
  const bucket = `test:${label}:${randomUUID()}`;
  buckets.push(bucket);
  return bucket;
}

// --- limiter failure probe ---------------------------------------------------

type QueryRawFn = typeof db.$queryRaw;
const realQueryRaw = db.$queryRaw.bind(db) as QueryRawFn;

/** Makes every limiter query throw, as an unreachable table would. */
function breakLimiter(): void {
  (db as { $queryRaw: QueryRawFn }).$queryRaw = (() => {
    throw new Error("simulated limiter outage");
  }) as unknown as QueryRawFn;
}

function restoreLimiter(): void {
  (db as { $queryRaw: QueryRawFn }).$queryRaw = realQueryRaw;
}

afterEach(() => {
  restoreLimiter();
});

after(async () => {
  restoreLimiter();
  if (buckets.length > 0) {
    await db.rateLimit.deleteMany({ where: { bucket: { in: buckets } } });
  }
});

// --- ISS-021: fail open vs fail closed ---------------------------------------

test("ISS-021 — a limiter outage on a default bucket allows the request (fails open)", async () => {
  const bucket = freshBucket("failopen");
  breakLimiter();

  const result = await rateLimit(bucket, 5, 60_000);

  assert.equal(
    result.allowed,
    true,
    "search and serviceability must not block users when the limiter breaks"
  );
});

test("ISS-021 — a limiter outage on a failClosed bucket denies the request", async () => {
  const bucket = freshBucket("failclosed");
  breakLimiter();

  const result = await rateLimit(bucket, 5, 60_000, { failClosed: true });

  assert.equal(
    result.allowed,
    false,
    "the OTP bucket must refuse to send when the limiter cannot be consulted"
  );
  assert.ok(result.retryAfterMs > 0, "a denial must tell the caller when to retry");
});

test("ISS-021 — the OTP path passes failClosed", async () => {
  // Guards the wiring, not the limiter: a correct limiter is useless if the OTP
  // caller forgets the option. Asserted against the source so it cannot silently
  // regress without also failing here.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../../../actions/auth.ts", import.meta.url),
    "utf8"
  );
  const otpCall = source.slice(source.indexOf("`otp:${formattedIdentifier}`"));
  assert.match(
    otpCall.slice(0, 220),
    /failClosed:\s*true/,
    "actions/auth.ts must request failClosed for the OTP bucket"
  );
});

// --- ISS-027: atomicity ------------------------------------------------------

test("ISS-027 — 20 concurrent calls against a limit of 5 allow exactly 5", async () => {
  const bucket = freshBucket("concurrent");

  const results = await Promise.all(
    Array.from({ length: 20 }, () => rateLimit(bucket, 5, 60_000))
  );

  const allowed = results.filter((r) => r.allowed).length;
  assert.equal(
    allowed,
    5,
    `expected exactly 5 of 20 concurrent calls to be allowed, got ${allowed} — ` +
      "the limiter is leaking under concurrency"
  );
});

test("ISS-027 — sequential calls allow exactly the limit and then deny", async () => {
  const bucket = freshBucket("sequential");
  const outcomes: boolean[] = [];

  for (let i = 0; i < 7; i++) {
    outcomes.push((await rateLimit(bucket, 3, 60_000)).allowed);
  }

  assert.deepEqual(outcomes, [true, true, true, false, false, false, false]);
});

// --- window behaviour --------------------------------------------------------

test("the window resets once it has expired", async () => {
  const bucket = freshBucket("window");

  // Exhaust a one-second window.
  assert.equal((await rateLimit(bucket, 1, 1_000)).allowed, true);
  assert.equal((await rateLimit(bucket, 1, 1_000)).allowed, false);

  // Age the window past its length rather than sleeping. Written with
  // LOCALTIMESTAMP so the test sits in the same clock domain as the limiter —
  // going through Prisma here would reintroduce the timezone skew the
  // implementation exists to avoid, and the test would pass for the wrong reason.
  await db.$executeRaw`
    UPDATE "rate_limits"
    SET "window_start" = LOCALTIMESTAMP - interval '5 seconds'
    WHERE "bucket" = ${bucket}
  `;

  assert.equal(
    (await rateLimit(bucket, 1, 1_000)).allowed,
    true,
    "an expired window must reset the counter"
  );
});

test("retryAfterMs stays within the window and does not grow with further attempts", async () => {
  const bucket = freshBucket("retryafter");
  const windowMs = 60_000;

  assert.equal((await rateLimit(bucket, 1, windowMs)).allowed, true);

  const first = await rateLimit(bucket, 1, windowMs);
  const second = await rateLimit(bucket, 1, windowMs);

  assert.equal(first.allowed, false);
  assert.ok(
    first.retryAfterMs > 0 && first.retryAfterMs <= windowMs,
    `retryAfterMs ${first.retryAfterMs} outside 0..${windowMs}`
  );
  assert.ok(
    second.retryAfterMs <= first.retryAfterMs,
    "the window is pinned, so retryAfterMs must not grow as attempts continue"
  );
});
