import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every action that moves money or changes what a customer is charged must
 * leave a durable trace, written in the same transaction as the change.
 *
 * `AuditLog` and `recordAudit` already existed and three paths used them —
 * order and booking transitions, product creation, serviceability edits. Four
 * did not, and each of the four decides money:
 *
 *   settings   the cashback rate, the express fee, the COD switch, the GSTIN
 *   coupons    the discount, its cap, how many times it can be used
 *
 * All they left was a stdout log line. `Setting.updatedBy` holds the last
 * actor and nothing more, so changing the cashback rate three times loses the
 * two earlier values and who set them. With no Sentry DSN configured
 * (ISS-012), those log lines are Vercel runtime logs and age out. "Who set
 * this to 5% and when" has to survive longer than that.
 *
 * The settings save was also not atomic: eight independent upserts under
 * `Promise.all`, so a failure part way through left cashback on with its fee
 * unset — a worse state than either end.
 *
 * The rule that makes the log worth having is that the audit row shares the
 * change's fate. A row written after the transaction commits is missing
 * exactly when something went wrong, which is the only time anybody reads it.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Code only, so a comment naming an action does not satisfy a check for it. */
function code(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");
}

/** Paths that change money or a customer-visible commitment. */
const MUST_AUDIT = [
  "actions/settings.ts",
  "actions/coupons.ts",
  "lib/services/admin/manage.ts",
  "lib/services/admin/product-create.ts",
  "lib/services/admin/serviceability-write.ts",
];

test("the audited paths are still there", () => {
  /* Non-vacuity: a moved file would make every assertion below pass on nothing. */
  for (const rel of MUST_AUDIT) {
    assert.ok(code(rel).length > 200, `${rel} is empty or gone`);
  }
});

test("every money-moving path writes an audit row", () => {
  for (const rel of MUST_AUDIT) {
    assert.match(
      code(rel),
      /recordAudit\(/,
      `${rel} changes money or a commitment and records nothing durable`
    );
  }
});

test("the audit row is written inside the transaction, not after it", () => {
  /* The whole point. `recordAudit(tx, …)` shares the change's fate;
     `recordAudit(db, …)` after a commit is a row that goes missing precisely
     when the change it describes went wrong. */
  for (const rel of MUST_AUDIT) {
    const src = code(rel);
    for (const m of src.matchAll(/recordAudit\(\s*([A-Za-z_$][\w$]*)/g)) {
      assert.notEqual(
        m[1],
        "db",
        `${rel} calls recordAudit(db, …) — outside any transaction, so the ` +
          `audit row can survive a change that rolled back, or be lost when one did not`
      );
    }
  }
});

test("settings are saved atomically", () => {
  /* Eight upserts under Promise.all could half-apply. Cashback switched on with
     its fee unset is not a state anybody chose. */
  const src = code("actions/settings.ts");
  assert.match(src, /\$transaction\(/, "the settings save is not transactional");
  assert.ok(
    !/Promise\.all\(\[\s*[\s\S]{0,80}writeSetting/.test(src),
    "settings are still written as independent parallel upserts"
  );
});

test("an unchanged save writes no audit row", () => {
  /* A trail of "nothing happened" entries is a trail nobody reads. Pressing
     Save with no edits must not manufacture history. */
  const src = code("actions/settings.ts");
  assert.match(
    src,
    /changed\.length === 0/,
    "saving with nothing changed still writes"
  );
});

test("pausing a coupon twice records one change, not two clicks", () => {
  /* The updateMany is guarded on the opposite state, so the second press
     changes no rows and writes no audit row. The log records changes. */
  const src = code("actions/coupons.ts");
  assert.match(
    src,
    /where:\s*\{\s*code,\s*isActive:\s*!isActive\s*\}/,
    "the pause/resume write is unguarded, so repeated clicks each write an audit row"
  );
});

test("stock has its own ledger and is not double-recorded", () => {
  /* StockMovement carries signed delta, resulting quantity, reason, note and
     actor — a better forensic record than a generic audit row, and the reason
     inventory is not on the list above. This pins that it stays that way. */
  const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
  const model = /model StockMovement \{([\s\S]*?)\n\}/.exec(schema);
  assert.ok(model, "StockMovement has gone — stock would then need audit rows");
  for (const field of ["qtyDelta", "qtyAfter", "reason", "actorEmail"]) {
    assert.match(model[1], new RegExp(`\\b${field}\\b`), `StockMovement lost ${field}`);
  }
});
