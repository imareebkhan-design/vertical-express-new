import test from "node:test";
import assert from "node:assert/strict";
import { purchasedSku, retiredSku, skuForDisplay } from "@/lib/retired-sku";

/**
 * A retired pack's item code is suffixed so the real product can be listed
 * again; every historical record reads the code the customer bought back
 * through this. The suffix is written and read by the same module.
 */

test("a retired code reads back as the code that was sold, and when it was retired", () => {
  const retired = retiredSku("VE-OPC-53-CEMENT-50KG", new Date("2026-11-17T12:00:00Z"));
  assert.equal(retired, "VE-OPC-53-CEMENT-50KG--LEGACY-20261117");
  assert.deepEqual(purchasedSku(retired), { code: "VE-OPC-53-CEMENT-50KG", retiredOn: "2026-11-17" });
  assert.equal(skuForDisplay(retired), "VE-OPC-53-CEMENT-50KG (retired listing)");
});

test("an ordinary code is untouched, including one that merely contains LEGACY", () => {
  for (const sku of ["VE-PPC-50", "LEGACY-PIPE-1IN", "VE-X--LEGACY-2026", "VE-X-LEGACY-20261117"]) {
    assert.deepEqual(purchasedSku(sku), { code: sku, retiredOn: null }, sku);
    assert.equal(skuForDisplay(sku), sku);
  }
});
