import { test } from "node:test";
import assert from "node:assert/strict";
import { getOpsExceptions } from "../exceptions";

/**
 * The exceptions panel is the one a dispatcher scans first, which makes a
 * missing row more expensive than a wrong one. Two things have to hold: every
 * row must come from something real, and the checks that cannot run must be
 * declared rather than passing silently.
 *
 * Silence from a check nobody made looks exactly like silence from a check that
 * found nothing. That is the failure this panel exists to avoid, so it is the
 * thing tested hardest here.
 */

test("the dummy gateway is always the first thing said", async () => {
  /* ISS-002. Every revenue number on the dashboard is downstream of whether
     money was actually taken, so this cannot be one row among many — it has to
     be at the top, and it has to be severity bad. The test database has no
     razorpay-live configuration, which is the condition being asserted. */
  const { found } = await getOpsExceptions();
  const gateway = found.find((e) => e.title.startsWith("Payment gateway is"));
  assert.ok(gateway, "the gateway is not flagged at all");
  assert.equal(gateway.severity, "bad");
  assert.equal(found[0], gateway, "a lesser exception is being shown above the gateway");
  assert.match(gateway.detail, /ISS-002/);
});

test("severities are ordered, worst first", async () => {
  const { found } = await getOpsExceptions();
  const rank = { bad: 0, warn: 1, info: 2 } as const;
  for (let i = 1; i < found.length; i++) {
    assert.ok(
      rank[found[i - 1].severity] <= rank[found[i].severity],
      `${found[i].title} (${found[i].severity}) is listed after a lesser exception`
    );
  }
});

test("every row carries enough to act on", async () => {
  const { found } = await getOpsExceptions();
  assert.ok(found.length > 0, "no exceptions found at all — this guard would be vacuous");
  for (const e of found) {
    assert.ok(e.title.trim().length > 0, "an exception with no title");
    assert.ok(
      e.detail.trim().length > 20,
      `"${e.title}" says what is wrong but not what it means`
    );
    if (e.href) assert.match(e.href, /^\/admin\//, `"${e.title}" links outside the console`);
  }
});

test("the checks that cannot run are named, not omitted", async () => {
  /* The whole point. A panel that quietly stops looking at slot capacity is
     worse than one that never claimed to — the artboard specifies five checks,
     and four of them have no data behind them. */
  const { unwatchable } = await getOpsExceptions();
  assert.ok(unwatchable.length >= 4, "checks the artboard specifies have gone missing");
  for (const u of unwatchable) {
    assert.ok(u.needs.trim().length > 0, `"${u.title}" does not say what it needs`);
  }
  const titles = unwatchable.map((u) => u.title).join(" | ").toLowerCase();
  for (const expected of ["slot", "vehicle", "batch", "purchase order"]) {
    assert.ok(titles.includes(expected), `nothing declares the ${expected} check as unrun`);
  }
});

test("nothing found is not the same as nothing wrong", async () => {
  /* Structural: `found` and `unwatchable` are separate fields, so an empty
     `found` can never absorb the unrun checks. If somebody merges them, a
     quiet day and a blind panel become the same output. */
  const res = await getOpsExceptions();
  assert.ok(Array.isArray(res.found));
  assert.ok(Array.isArray(res.unwatchable));
  assert.notEqual(res.found, res.unwatchable);
});

