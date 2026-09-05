import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The issue register must not claim something is broken that the code has fixed.
 *
 * This is not pedantry about documentation. `docs/KNOWN_ISSUES.md` is what the
 * next person reads to decide what to work on, and CLAUDE.md's source-of-truth
 * hierarchy puts it second only to the code. Three entries had drifted far
 * enough to send somebody to rebuild work that already existed:
 *
 *   ISS-019 said admin product management was read-only, while
 *   actions/listing.ts creates products and actions/inventory.ts adjusts stock.
 *
 *   ISS-012 said there was no monitoring, while Sentry and PostHog were wired
 *   and only the keys were unset.
 *
 *   ISS-009's Evidence said "no shipment, driver, or POD entity exists" — the
 *   Progress note above it had been updated when Shipment landed and the
 *   Evidence below it had not.
 *
 * A register that is wrong in this direction is worse than no register, because
 * it is trusted. Each check below pairs a claim in the document with the code
 * that contradicts it, so the two cannot drift apart again without a test going
 * red.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REGISTER = readFileSync(join(ROOT, "docs/KNOWN_ISSUES.md"), "utf8");

/** The status cell for an issue in the summary table. */
function statusOf(id: string): string {
  const row = REGISTER.split("\n").find((l) => l.startsWith(`| ${id} |`));
  assert.ok(row, `${id} has no row in the summary table`);
  const cells = row.split("|").map((c) => c.trim());
  return cells[cells.length - 2];
}

test("the summary table is readable at all", () => {
  /* Non-vacuity: if the table format changes, statusOf would silently return
     nonsense and every check below would pass on garbage. */
  const status = statusOf("ISS-001");
  assert.match(status, /FIXED|OPEN|PARTIAL|BLOCKED|IN PROGRESS/, `got "${status}"`);
});

test("ISS-019 is not OPEN while the admin write actions exist", () => {
  const writes = ["actions/listing.ts", "actions/products.ts", "actions/inventory.ts"];
  const present = writes.filter((f) => existsSync(join(ROOT, f)));
  assert.deepEqual(present, writes, "an admin write action has been removed");

  assert.notEqual(
    statusOf("ISS-019"),
    "OPEN",
    "ISS-019 says admin product management is read-only, but listing, product and " +
      "inventory write actions all exist. Somebody reading this would rebuild them."
  );
});

test("ISS-012 is not OPEN while Sentry and PostHog are wired", () => {
  const pkg = readFileSync(join(ROOT, "package.json"), "utf8");
  const instrumentation = readFileSync(join(ROOT, "instrumentation.ts"), "utf8");

  const wired =
    pkg.includes("@sentry/nextjs") &&
    pkg.includes("posthog-js") &&
    instrumentation.includes("initSentry");
  assert.ok(wired, "the observability wiring has been removed");

  assert.notEqual(
    statusOf("ISS-012"),
    "OPEN",
    "ISS-012 says there is no monitoring, but Sentry and PostHog are dependencies " +
      "and initSentry runs at boot. What is missing is the keys, which is PARTIAL."
  );
});

test("ISS-009's evidence does not deny a model that exists", () => {
  const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
  assert.match(schema, /^model Shipment /m, "the Shipment model has been removed");

  /* The exact sentence that survived the model landing. Matched loosely so a
     reworded denial is caught too. */
  assert.ok(
    !/no shipment, driver, or POD entity exists/i.test(REGISTER),
    "ISS-009 still states no shipment entity exists. Shipment has existed since " +
      "20260826095435_add_shipments."
  );
});

test("nothing claims the fulfilment loop is complete either", () => {
  /* The opposite failure, and the more dangerous one: a model existing is not
     the same as the loop working.
   *
   * The assertion below has not changed. Its reasoning has, and that is worth
   * recording: this comment used to say "shipments are created at `pending` and
   * never advanced — there is no shipment.update anywhere outside tests", and
   * that stopped being true on 5 Sep. The test kept passing while telling a
   * reader something false, which is the same drift it exists to catch, one
   * level up.
   *
   * ISS-009 stays open for what actually remains: no Slot model (ISS-057), so
   * checkout cannot offer a window and `promisedAt` is never written; and
   * `Order.status` is still not derived from its shipments, which is deliberate
   * under the expand/migrate/contract rule rather than missing. */
  const status = statusOf("ISS-009");
  assert.notEqual(
    status,
    "FIXED",
    "ISS-009 is marked fixed. The loop advances now, but there is still no Slot " +
      "model and Order.status is not derived from shipment state."
  );

  /* And the reason has to keep being true. If a Slot model appears, this test
     is the thing that should force ISS-009 to be looked at again. */
  const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
  assert.ok(
    !/^model (Slot|DeliverySlot) /m.test(schema),
    "a Slot model now exists — ISS-009 and ISS-057 both need revisiting, and this " +
      "test's stated reason for keeping ISS-009 open is no longer the real one"
  );
});
