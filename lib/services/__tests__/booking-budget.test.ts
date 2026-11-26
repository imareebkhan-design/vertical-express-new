import assert from "node:assert/strict";
import test from "node:test";
import { bookingBudget } from "@/lib/services/booking-budget";
import type { rateLimit } from "@/lib/services/rate-limit";
import { readFileSync } from "node:fs";

function limiter() {
  const counts = new Map<string, number>();
  const calls: string[] = [];
  const limit: typeof rateLimit = async (key, max, _window, options) => {
    assert.equal(options?.failClosed, true);
    calls.push(key);
    const hits = (counts.get(key) ?? 0) + 1;
    counts.set(key, hits);
    return { allowed: hits <= max, retryAfterMs: hits <= max ? 0 : 1000 };
  };
  return { counts, calls, limit };
}

test("rotating submitted numbers does not bypass the address budget", async () => {
  const { limit, calls } = limiter();
  for (let i = 0; i < 5; i++) assert.equal(await bookingBudget("192.0.2.1", `phone-${i}`, limit), true);
  assert.equal(await bookingBudget("192.0.2.1", "victim", limit), false);
  assert.equal(calls.includes("booking:victim"), false, "blocked address must not exhaust another phone's quota");
  assert.equal(await bookingBudget("192.0.2.2", "victim", limit), true);
});

test("existing phone quota still limits calls from different addresses", async () => {
  const { limit } = limiter();
  for (let i = 0; i < 5; i++) assert.equal(await bookingBudget(`ip-${i}`, "same-phone", limit), true);
  assert.equal(await bookingBudget("new-ip", "same-phone", limit), false);
});

test("global daily ceiling bounds rotating addresses and phones", async () => {
  const { limit, counts } = limiter();
  counts.set("booking-global:day", 999);
  assert.equal(await bookingBudget("ip-a", "phone-a", limit), true);
  assert.equal(await bookingBudget("ip-b", "phone-b", limit), false);
});

test("limiter outage refuses booking and stops subsequent checks", async () => {
  let calls = 0;
  assert.equal(await bookingBudget("ip", "phone", async (_key, _max, _window, options) => {
    calls++;
    assert.equal(options?.failClosed, true);
    return { allowed: false, retryAfterMs: 1000 };
  }), false);
  assert.equal(calls, 1);
});

test("action checks a server-derived address budget before creating any booking", () => {
  const source = readFileSync(new URL("../../../actions/booking.ts", import.meta.url), "utf8");
  assert.match(source, /getClientIp\(new Request\("http:\/\/local", \{ headers: await headers\(\) \}\)\)/);
  assert.ok(source.indexOf("await bookingBudget(") < source.indexOf("await createBooking("));
});
