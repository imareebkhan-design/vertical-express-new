import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isWalletCredit } from "@/lib/wallet-tx";

/**
 * A wallet credit must not render as money taken out.
 *
 * `components/mobile/account/mobile-wallet-view.tsx` asked
 * `t.type === "credit"`. WalletTransactionType has no such member — it is
 * cashback_credit | order_debit | refund_credit | expired — so the comparison
 * was false for every row that can exist. Every transaction on the mobile
 * wallet rendered with a down arrow, the fallback label "Used on an order" and
 * a leading minus, which means a refund credited to a customer's wallet read as
 * a deduction from it.
 *
 * `transactions` is typed `any[]` on that component, so the compiler could not
 * see it. The type is the only thing that carries direction, which is why both
 * views now go through one helper.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Every value the column can actually hold, from prisma/schema.prisma. */
const SCHEMA_TYPES = (() => {
  const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
  const block = /enum WalletTransactionType \{([^}]*)\}/.exec(schema);
  assert.ok(block, "WalletTransactionType has gone from the schema");
  return block[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*/, "").trim())
    .filter(Boolean);
})();

test("the helper's vocabulary matches the schema enum", () => {
  /* If a member is added to the enum and not classified here, it falls through
     to "debit" silently — which is how the original bug read. */
  assert.deepEqual(
    SCHEMA_TYPES.sort(),
    ["cashback_credit", "expired", "order_debit", "refund_credit"],
    "WalletTransactionType changed; classify the new member in lib/wallet-tx.ts"
  );
});

test("money coming in is a credit and money going out is not", () => {
  assert.equal(isWalletCredit("cashback_credit"), true);
  assert.equal(isWalletCredit("refund_credit"), true, "a refund must not render as a deduction");
  assert.equal(isWalletCredit("order_debit"), false);
  assert.equal(isWalletCredit("expired"), false);
});

test("no wallet view decides direction from a value the enum cannot hold", () => {
  /* The exact shape of the original defect: a comparison against a string that
     is not a member, which is false forever and fails closed to "debit". */
  for (const rel of [
    "components/account/wallet-view.tsx",
    "components/mobile/account/mobile-wallet-view.tsx",
  ]) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const comparisons = [...src.matchAll(/type\s*={2,3}\s*"([^"]*)"/g)].map((m) => m[1]);
    for (const value of comparisons) {
      assert.ok(
        SCHEMA_TYPES.includes(value),
        `${rel} compares a transaction type against "${value}", which WalletTransactionType cannot hold`
      );
    }
  }
});

test("neither wallet view decides direction from the stored sign", () => {
  /* `amountPaise > 0` was the desktop's test. It is right only by accident: the
     one writer stores a positive amount and no debit has ever been written, so
     the convention is untested. Direction belongs to the type. */
  for (const rel of [
    "components/account/wallet-view.tsx",
    "components/mobile/account/mobile-wallet-view.tsx",
  ]) {
    const src = readFileSync(join(ROOT, rel), "utf8")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ");
    assert.ok(
      !/isCredit\s*=\s*[^;]*amountPaise\s*[<>]/.test(src),
      `${rel} decides credit or debit from the sign of amountPaise rather than the type`
    );
    assert.match(src, /isWalletCredit\(/, `${rel} no longer uses the shared direction helper`);
  }
});
