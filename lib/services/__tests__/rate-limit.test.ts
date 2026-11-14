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
import { rateLimit, pruneRateLimits, RATE_LIMIT_RETENTION_MS } from "../rate-limit";

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

test("ISS-021 — every paid lookup on our server asks its limiter to fail closed", async () => {
  /* This used to check the Supabase OTP send in actions/auth.ts. That path was
     deleted on 12 Oct 2026: a phone code is now requested from Firebase in the
     browser and never passes through this limiter (its own abuse protection is
     ISS-047). What still costs money per call on our server are the Google
     lookups; a limiter that cannot be consulted must refuse them, not wave them
     through. Asserted against the source so forgetting the option fails here. */
  const { readFile } = await import("node:fs/promises");
  for (const rel of ["../../api/places.ts", "../location-lookup.ts"]) {
    const source = await readFile(new URL(rel, import.meta.url), "utf8");
    const calls = source.match(/rateLimit\([\s\S]*?\)\s*[,;)]/g) ?? [];
    assert.ok(calls.length > 0, `${rel} no longer rate limits at all`);
    for (const call of calls) {
      assert.match(call, /failClosed:\s*true/, `${rel}: a limiter call does not fail closed:\n${call}`);
    }
  }
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

// --- ISS-042: retention ------------------------------------------------------

/** Puts a bucket row whose window opened `ageMs` ago, as an old visitor would have left it. */
async function seedAged(label: string, ageMs: number): Promise<string> {
  const bucket = freshBucket(label);
  await db.$executeRaw`
    INSERT INTO "rate_limits" ("id", "bucket", "hits", "window_start")
    VALUES (gen_random_uuid(), ${bucket}, 3, LOCALTIMESTAMP - (${ageMs}::bigint * interval '1 millisecond'))
  `;
  return bucket;
}

const exists = async (bucket: string) => (await db.rateLimit.count({ where: { bucket } })) === 1;

test("ISS-042 — rows past the retention horizon are reclaimed; rows inside it, including a running daily window, are not", async () => {
  const DAY = 24 * 60 * 60 * 1000;
  const stale = await seedAged("stale", RATE_LIMIT_RETENTION_MS + DAY);
  const runningDaily = await seedAged("daily", DAY - 60_000);
  const lapsedMinute = await seedAged("minute", 2 * 60 * 60 * 1000);
  const live = freshBucket("live");
  await rateLimit(live, 5, 60_000);

  const pruned = await pruneRateLimits();

  assert.ok(pruned >= 1, "the stale row was not reclaimed");
  assert.equal(await exists(stale), false, "a row older than the retention horizon survived");
  assert.equal(await exists(runningDaily), true, "a daily window still running was deleted, which would reset its limit early");
  assert.equal(await exists(lapsedMinute), true, "rows inside the retention horizon are kept");
  assert.equal(await exists(live), true, "an active bucket was deleted");
});

test("ISS-042 — retention outlasts the longest window any caller uses", () => {
  /* Pruning a row resets its bucket. Safe only while every window is shorter
     than retention; the longest today is one day. */
  assert.ok(RATE_LIMIT_RETENTION_MS > 86_400_000);
});

test("ISS-042 — a prune is bounded per call, so a first run cannot lock a large table for long", async () => {
  const a = await seedAged("batch-a", RATE_LIMIT_RETENTION_MS + 60_000);
  const b = await seedAged("batch-b", RATE_LIMIT_RETENTION_MS + 60_000);
  const first = await pruneRateLimits(RATE_LIMIT_RETENTION_MS, 1);
  assert.equal(first, 1);
  const left = (await exists(a) ? 1 : 0) + (await exists(b) ? 1 : 0);
  assert.equal(left, 1, "a batch of one deleted more than one row");
  await pruneRateLimits();
});

test("ISS-042 — the scheduled cleanup prunes, and a failed prune does not fail the order cleanup", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../../../app/api/cron/cleanup-orders/route.ts", import.meta.url), "utf8");
  assert.match(route, /pruneRateLimits\(\)/, "the cron no longer reclaims rate_limits rows");
  assert.match(route, /try\s*{\s*prunedRateLimits = await pruneRateLimits\(\);\s*}\s*catch/, "a prune failure must be contained");
});
