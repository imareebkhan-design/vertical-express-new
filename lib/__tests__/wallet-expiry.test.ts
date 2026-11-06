import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A wallet credit must not carry an expiry date nobody set.
 *
 * `creditCashbackForOrder` wrote `expiresAt = Date.now() + 30 days`, with the
 * comment "30 days expiry". How long a customer's money stays theirs is a
 * policy, and thirty days was a constant in a source file — the same defect as
 * the hardcoded 5% cashback rate directly above it, and as the hardcoded SLA
 * targets (ISS-064). The desktop wallet renders "Expires: <date>" straight from
 * this column, so the invented number reached the customer as a deadline.
 *
 * It was wrong in both directions at once. Nothing expires a balance anywhere:
 * no code writes the `expired` transaction type and there is no cron for it, so
 * the date passed and the money stayed — the warning was false. And if an
 * expiry job is built later, it would begin enforcing thirty days against
 * credits issued under no policy at all.
 *
 * The column and the enum member stay. Absent means no expiry has been agreed,
 * which is how every other unset policy value in this codebase behaves.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const wallet = readFileSync(join(ROOT, "lib/services/wallet.ts"), "utf8");

/** Code only. The comment explaining the removal names the old expression. */
const code = wallet
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");

test("the cashback credit is still written", () => {
  /* Non-vacuity: with the whole function gone, or the comment stripper too
     greedy, the assertions below pass on nothing. */
  assert.match(code, /type: "cashback_credit"/, "the cashback credit has gone");
  assert.match(code, /walletTransaction\.create/, "no wallet transaction is written");
});

test("no expiry date is invented for a wallet credit", () => {
  assert.ok(
    !/expiresAt/.test(code),
    "a cashback credit is written with an expiry date; no expiry policy has been set"
  );
  assert.ok(
    !/\d+\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(code),
    "a duration in days is hardcoded in the wallet service"
  );
});

test("nothing claims to expire a balance while no mechanism does", () => {
  /* The other half of the defect. If a job is ever added that writes the
     `expired` type and decrements the balance, this test should be replaced by
     one covering it — and an expiry window can be set in `settings` then. */
  const services = readFileSync(join(ROOT, "lib/services/wallet.ts"), "utf8");
  assert.ok(
    !/type:\s*"expired"/.test(services),
    "an expiry transaction is written; if expiry now exists, set the window in settings rather than in code"
  );
});
