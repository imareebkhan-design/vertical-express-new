import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A figure nobody can compute must not be shown as one that was measured.
 *
 * The business-intelligence dashboard carried three, side by side, on the
 * inventory tab:
 *
 *   Current Stock Value    qtyOnHand * pricePaise — the SELLING price. Stock
 *                          valued at retail overstates it by the entire
 *                          margin, and this is the number quoted to a bank, an
 *                          accountant or an insurer in good faith. ISS-062.
 *   Turnover Rate          netSales / that same wrong total. Turnover is cost
 *                          of goods sold over average inventory at cost, and
 *                          the comment beside the code said exactly that while
 *                          the code used neither term.
 *   Warehouse Utilization  activeStock / (warehouseCount * 10000). `Warehouse`
 *                          has no capacity column; ten thousand was invented.
 *
 * `/admin/inventory` already said stock value was a sentence rather than a
 * figure and explained why. This dashboard said otherwise two screens away —
 * the recurring shape of an honest detail page behind an asserting summary.
 *
 * All three are null now, and the cards say what is missing. That follows the
 * rule the SLA targets established (ISS-064): absent means *not computable*,
 * not zero and not "fine".
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Source with comments stripped, so an explanation cannot satisfy a check. */
function code(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");
}

const bi = code("lib/services/admin/bi.ts");
const dashboard = code("components/admin/bi/dashboard-container.tsx");

test("the inventory analytics still exist", () => {
  /* Non-vacuity: with the block deleted or the stripper too greedy, every
     assertion below passes on nothing. */
  assert.match(bi, /outOfStockCount/, "the inventory analytics have gone");
  assert.match(dashboard, /Current Stock Value/, "the stock value card has gone");
});

test("stock is never valued at the price a customer pays", () => {
  /* The defect exactly: multiplying quantity by the selling price. */
  assert.ok(
    !/qty\s*\*\s*v\.pricePaise/.test(bi),
    "stock is valued at the selling price, which overstates it by the whole margin"
  );
  assert.ok(
    !/totalInventoryValue/.test(bi),
    "a stock valuation is being accumulated without a cost basis"
  );
});

test("no warehouse capacity is invented", () => {
  /* `Warehouse` has no capacity column, so any constant here is somebody's
     guess wearing a percentage sign. */
  const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
  const warehouse = /model Warehouse \{([\s\S]*?)\n\}/.exec(schema);
  assert.ok(warehouse, "the Warehouse model has gone");

  if (!/capacity/i.test(warehouse[1])) {
    assert.ok(
      !/\*\s*10000|capacityLimit/.test(bi),
      "warehouse utilisation divides by an invented capacity; Warehouse has no capacity column"
    );
  }
});

test("the three uncomputable figures are null, not zero", () => {
  /* Zero is a measurement. Null is the absence of one, and only null makes the
     card able to explain itself. */
  for (const [name, re] of [
    ["totalValuePaise", /totalValuePaise:\s*null/],
    ["utilizationPct", /const utilizationPct = null/],
    ["turnoverRate", /const turnoverRate = null/],
  ] as const) {
    assert.match(bi, re, `${name} is being computed again without the input it needs`);
  }
});

test("each card says what is missing rather than showing a number", () => {
  /* A greyed-out figure with no explanation reads as a loading state. */
  assert.match(dashboard, /Not computable/, "no card explains an unavailable figure");
  assert.match(dashboard, /ISS-062/, "the cards no longer point at why the figure is missing");
  assert.match(
    dashboard,
    /No capacity is recorded against a warehouse/,
    "warehouse utilisation no longer explains itself"
  );
});

test("the honest inventory page and the dashboard still agree", () => {
  /* The two surfaces that disagreed. If /admin/inventory ever starts showing a
     stock value, this should be the thing that notices. */
  const inventory = code("app/admin/inventory/page.tsx");
  const claimsAFigure = /formatPaise\([^)]*(value|worth|valuation)/i.test(inventory);
  assert.equal(
    claimsAFigure,
    false,
    "/admin/inventory now prints a stock value while the dashboard says it is not computable"
  );
});
