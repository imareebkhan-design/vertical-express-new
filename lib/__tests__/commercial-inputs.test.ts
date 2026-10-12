import test from "node:test";
import assert from "node:assert/strict";
import { problemsCsv, validateCommercialInputs } from "@/lib/catalog/commercial-inputs";
import { readRecords } from "@/lib/catalogue-csv";

/**
 * The owner's launch commercial-input sheets are checked in one pass, with the
 * shop's own sellability rules, and nothing that is a business value is ever
 * filled in for them.
 */

const HEADER =
  'batch,slug,title,brand,category,category_gst_confirmed,SELL_ONLINE (Y/N),"pack_or_variant (e.g. 1 unit, kit with battery)",delivery (express/scheduled),selling_price_INR_incl_GST,MRP_INR (if printed),opening_stock_units,warehouse (default Srinagar Central),notes';
const GST_HEADER = "category,category_name,products_affected,HSN_code (from your CA),GST_rate_pct (from your CA),confirmed_by,notes";
const TAX = { "general-hardware-tools": { hsn: "8205", ratePct: 18 } };
const OPTS = { warehouses: ["Srinagar Central"], existingTax: TAX };

const row = (slug: string, category: string, cells: string) => `B01,${slug},Title ${slug},XP,${category},yes,${cells}`;
const run = (rows: string[], gst: string[] = []) =>
  validateCommercialInputs([HEADER, ...rows].join("\n"), [GST_HEADER, ...gst].join("\n"), OPTS);

test("a complete row becomes a sellable plan entry with paise and the default warehouse", () => {
  const r = run([row("gun-103", "general-hardware-tools", 'Y,1 unit,scheduled,"1,299.50",1500,0,,')]);
  assert.deepEqual(r.problems, []);
  assert.equal(r.sellable.length, 1);
  assert.deepEqual(
    { ...r.sellable[0], title: undefined },
    { slug: "gun-103", title: undefined, category: "general-hardware-tools", pack: "1 unit", deliverySpeed: "scheduled",
      pricePaise: 129950, compareAtPaise: 150000, openingStock: 0, warehouse: "Srinagar Central", notes: "" },
  );
});

test("blank SELL_ONLINE keeps the product catalogue-only and asks for nothing", () => {
  const r = run([row("gun-103", "power-tools", ",,,,,,,")]);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.catalogueOnly, ["gun-103"]);
  assert.equal(r.sellable.length, 0);
});

test("nothing is guessed: every missing business value on a Y row is a problem, and the row is not sellable", () => {
  const r = run([row("gun-103", "general-hardware-tools", "Y,,,,,,,")]);
  const cols = r.problems.map((p) => p.column).sort();
  assert.deepEqual(cols, ["delivery", "opening_stock_units", "pack_or_variant", "selling_price_INR_incl_GST"]);
  assert.equal(r.sellable.length, 0);
});

test("MRP equal to the selling price is refused, as the price editor refuses it", () => {
  const r = run([row("a", "general-hardware-tools", "Y,1 unit,express,500,500,3,,")]);
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0].column, "MRP_INR");
  assert.match(r.problems[0].problem, /MRP must be above/);
});

test("a category without confirmed GST blocks its products until sheet 2 confirms it", () => {
  const blocked = run([row("drill", "power-tools", "Y,1 unit,express,2500,,4,,")]);
  assert.equal(blocked.sellable.length, 0);
  assert.match(blocked.problems[0].problem, /GST for "power-tools" is not confirmed/);

  const ok = run([row("drill", "power-tools", "Y,1 unit,express,2500,,4,,")], ["power-tools,Power Tools,204,8467,18,CA Name,"]);
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.categoryTax, [{ category: "power-tools", hsn: "8467", ratePct: 18, confirmedBy: "CA Name" }]);
});

test("GST rows: bad HSN, missing confirmer, and a clash with the shop's existing mapping are reported", () => {
  const r = run([], [
    "power-tools,Power Tools,204,84,18,,",
    "general-hardware-tools,Tools,4,8205,12,CA,",
  ]);
  const msgs = r.problems.map((p) => `${p.key}:${p.column}`).sort();
  assert.deepEqual(msgs, ["general-hardware-tools:HSN_code", "power-tools:HSN_code", "power-tools:confirmed_by"]);
});

test("values on an N row are flagged as ignored; duplicates, bad Y/N, unknown warehouse and bad stock are reported", () => {
  const r = run([
    row("a", "general-hardware-tools", "N,1 unit,,100,,,,"),
    row("b", "general-hardware-tools", "maybe,,,,,,,"),
    row("c", "general-hardware-tools", "Y,1 unit,express,100,,-2,Jammu,"),
    row("c", "general-hardware-tools", "Y,1 unit,express,100,,1,,"),
  ]);
  const got = r.problems.map((p) => `${p.row}:${p.column}`);
  assert.deepEqual(got, ["2:SELL_ONLINE", "3:SELL_ONLINE", "4:opening_stock_units", "4:warehouse", "5:slug"]);
});

test("a missing column is reported once and nothing is planned", () => {
  const r = validateCommercialInputs("slug,title\nx,y", GST_HEADER, OPTS);
  assert.ok(r.problems.some((p) => p.column === "SELL_ONLINE"));
  assert.ok(r.problems.some((p) => p.column === "delivery"));
  assert.equal(r.sellable.length, 0);
});

test("prices follow the shop's rupee rule, including a currency-formatted cell", () => {
  const r = run([row("a", "general-hardware-tools", 'Y,1 unit,express,"₹1,299.5",abc,1,,')]);
  assert.deepEqual(r.problems.map((p) => p.column), ["MRP_INR"]);
  const ok = run([row("a", "general-hardware-tools", 'Y,1 unit,express,"₹1,299.5",,"1,500",,')]);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.sellable[0].pricePaise, 129950);
  assert.equal(ok.sellable[0].openingStock, 1500);
  const three = run([row("a", "general-hardware-tools", "Y,1 unit,express,12.345,,1,,")]);
  assert.equal(three.problems[0].column, "selling_price_INR_incl_GST");
});

test("the problems sheet round-trips through the importer's CSV reader", () => {
  const out = problemsCsv([{ sheet: "products", row: 2, key: "x", column: "MRP_INR", problem: 'Use "Y", or N' }]);
  assert.deepEqual(readRecords(out)[1].fields, ["products", "2", "x", "MRP_INR", 'Use "Y", or N']);
});
