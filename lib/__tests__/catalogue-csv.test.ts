import assert from "node:assert/strict";
import test from "node:test";
import {
  CATALOGUE_CSV_TEMPLATE,
  CATALOGUE_HEADER,
  parseCatalogueCsv,
  skuForSlug,
  slugifyTitle,
} from "@/lib/catalogue-csv";

/**
 * The catalogue importer's parser.
 *
 * ISS-007 makes this the file that gets the real catalogue in. Everything it
 * accepts becomes a product on the storefront at a price a customer pays, so
 * the tests below are mostly about what it *refuses*.
 *
 * The case that drove the design is the first one: every cement product in this
 * catalogue is titled "…Cement, 50 kg Bag", with a comma. The serviceability
 * parser splits on a bare comma — correctly, because a pincode has none — and
 * reusing it here would shift every column after the title on the majority of
 * rows, which is the kind of corruption that looks like a shrug on screen and a
 * wrong price in the database.
 */
const H = CATALOGUE_HEADER.join(",");

/** A row that is valid in every field, so a test can spoil exactly one. */
function row(over: Partial<Record<string, string>> = {}): string {
  const base: Record<string, string> = {
    title: "Cement Bag",
    brand: "UltraTech",
    category: "cement",
    pack: "50 kg bag",
    unit_label: "per bag",
    price_rupees: "385",
    mrp_rupees: "",
    stock: "500",
    warehouse: "Srinagar Central",
    express: "no",
    express_pincodes: "",
    status: "published",
    description: "",
  };
  return CATALOGUE_HEADER.map((c) => ({ ...base, ...over })[c] ?? "").join(",");
}

const file = (...lines: string[]) => [H, ...lines].join("\n") + "\n";

/** The issues for one column, so an assertion can name what it is looking for. */
const on = (res: ReturnType<typeof parseCatalogueCsv>, column: string) =>
  res.ok ? [] : res.issues.filter((i) => i.column === column);

test("a title containing a comma survives, which is why this parser exists", () => {
  const res = parseCatalogueCsv(file(row({ title: '"OPC 53 Grade Cement, 50 kg Bag"' })));
  assert.equal(res.ok, true, res.ok ? "" : JSON.stringify(res.issues));
  if (!res.ok) return;
  assert.equal(res.rows[0].title, "OPC 53 Grade Cement, 50 kg Bag");
  /* And the columns after it did not shift. */
  assert.equal(res.rows[0].pricePaise, 38500);
  assert.equal(res.rows[0].status, "published");
});

test("a quote inside a quoted field is written twice, as CSV says", () => {
  const res = parseCatalogueCsv(file(row({ title: '"CPVC Pipe 1"" x 3 m"' })));
  assert.equal(res.ok, true, res.ok ? "" : JSON.stringify(res.issues));
  if (res.ok) assert.equal(res.rows[0].title, 'CPVC Pipe 1" x 3 m');
});

test("an inch mark in the middle of a value is just a character", () => {
  /* Only a quote at the start of a field opens one. `1" pipe` is not quoted. */
  const res = parseCatalogueCsv(file(row({ pack: '1" pipe' })));
  assert.equal(res.ok, true, res.ok ? "" : JSON.stringify(res.issues));
  if (res.ok) assert.equal(res.rows[0].pack, '1" pipe');
});

test("a newline inside a quoted description does not end the row", () => {
  const res = parseCatalogueCsv(file(row({ description: '"Two lines:\nsecond line"' })));
  assert.equal(res.ok, true, res.ok ? "" : JSON.stringify(res.issues));
  if (res.ok) assert.equal(res.rows[0].description, "Two lines:\nsecond line");
});

test("the byte-order mark Excel writes does not break the header", () => {
  /* Left in place it joins the first header cell, and the mismatch message
     names two strings that look identical. */
  const res = parseCatalogueCsv("﻿" + file(row()));
  assert.equal(res.ok, true, res.ok ? "" : JSON.stringify(res.issues));
});

test("CRLF line endings and trailing blank lines are fine", () => {
  const res = parseCatalogueCsv([H, row(), "", ""].join("\r\n") + "\r\n");
  assert.equal(res.ok, true, res.ok ? "" : JSON.stringify(res.issues));
  if (res.ok) assert.equal(res.rows.length, 1);
});

test("a row of nothing but commas is ignored, not reported", () => {
  /* What a spreadsheet leaves under the last real row. */
  const res = parseCatalogueCsv(file(row(), ",,,,,,,,,,,,"));
  assert.equal(res.ok, true, res.ok ? "" : JSON.stringify(res.issues));
  if (res.ok) assert.equal(res.rows.length, 1);
});

test("the header must be exactly right", () => {
  for (const [name, header] of [
    ["a missing column", CATALOGUE_HEADER.slice(0, -1).join(",")],
    ["an extra column", H + ",hsn"],
    ["a reordered column", ["brand", ...CATALOGUE_HEADER.filter((c) => c !== "brand")].join(",")],
  ] as const) {
    const res = parseCatalogueCsv(header + "\n" + row() + "\n");
    assert.equal(res.ok, false, `${name} was accepted`);
    if (!res.ok) assert.equal(res.issues[0].column, "header", name);
  }
});

test("an empty file and a header with no rows say so differently", () => {
  const empty = parseCatalogueCsv("");
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.issues[0].message, /empty/i);

  const headerOnly = parseCatalogueCsv(H + "\n");
  assert.equal(headerOnly.ok, false);
  if (!headerOnly.ok) assert.match(headerOnly.issues[0].message, /no rows/i);
});

test("the template parses, and contains no product", () => {
  /* The examples are commented out on purpose: an example needs a price, and a
     price nobody chose is exactly the invented value this project keeps having
     to remove. Uploading the template unchanged must be a no-op, not a product
     listed at a made-up number. */
  const res = parseCatalogueCsv(CATALOGUE_CSV_TEMPLATE);
  assert.equal(res.ok, false, "the template contains a real data row");
  if (!res.ok) assert.match(res.issues[0].message, /no rows/i);
  assert.ok(CATALOGUE_CSV_TEMPLATE.startsWith(H), "the template header drifted from the parser");
});

test("a short row says how to write a comma", () => {
  const res = parseCatalogueCsv(file("Cement,UltraTech,cement"));
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.issues[0].message, /quotes/);
});

test("a price is refused rather than coerced", () => {
  for (const [price, why] of [
    ["", "a blank price"],
    ["abc", "a non-numeric price"],
    ["12abc", "a partly-numeric price"],
    ["1e3", "exponent notation"],
    ["385.555", "three decimal places"],
    ["0", "a price of zero"],
    ["-5", "a negative price"],
  ] as const) {
    const res = parseCatalogueCsv(file(row({ price_rupees: price })));
    assert.equal(res.ok, false, `${why} was accepted`);
    assert.ok(on(res, "price_rupees").length > 0, `${why} was not blamed on the price column`);
  }
});

test("rupees become paise with no float in the way", () => {
  const res = parseCatalogueCsv(file(row({ price_rupees: "19.99" })));
  assert.equal(res.ok, true);
  /* 19.99 * 100 is 1998.9999999999998 in IEEE 754. The paise are assembled
     from the digits, so there is nothing to round. */
  if (res.ok) assert.equal(res.rows[0].pricePaise, 1999);
});

test("an MRP that is not above the price is not a discount", () => {
  for (const mrp of ["385", "300"]) {
    const res = parseCatalogueCsv(file(row({ price_rupees: "385", mrp_rupees: mrp })));
    assert.equal(res.ok, false, `an MRP of ${mrp} against a price of 385 was accepted`);
    assert.ok(on(res, "mrp_rupees").length > 0);
  }
  const good = parseCatalogueCsv(file(row({ price_rupees: "385", mrp_rupees: "440" })));
  assert.equal(good.ok, true);
  if (good.ok) assert.equal(good.rows[0].compareAtPaise, 44000);
});

test("a blank MRP means no struck-through price, not zero", () => {
  const res = parseCatalogueCsv(file(row({ mrp_rupees: "" })));
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.rows[0].compareAtPaise, null);
});

test("stock is a whole number, and needs somewhere to sit", () => {
  const fractional = parseCatalogueCsv(file(row({ stock: "10.5" })));
  assert.equal(fractional.ok, false);
  assert.ok(on(fractional, "stock").length > 0);

  const homeless = parseCatalogueCsv(file(row({ stock: "10", warehouse: "" })));
  assert.equal(homeless.ok, false, "stock was accepted with no warehouse to put it in");
  assert.ok(on(homeless, "warehouse").length > 0);

  /* Zero stock needs no warehouse — a product can be listed before it arrives. */
  const none = parseCatalogueCsv(file(row({ stock: "", warehouse: "" })));
  assert.equal(none.ok, true, none.ok ? "" : JSON.stringify(none.issues));
  if (none.ok) assert.equal(none.rows[0].stock, 0);
});

test("express and its pincodes have to agree", () => {
  const nowhere = parseCatalogueCsv(file(row({ express: "yes", express_pincodes: "" })));
  assert.equal(nowhere.ok, false, "a product was marked express and eligible nowhere");
  assert.ok(on(nowhere, "express_pincodes").length > 0);

  /* Dropping the list silently would leave somebody sure they had set this up;
     honouring it would contradict the column that says no. */
  const contradiction = parseCatalogueCsv(file(row({ express: "no", express_pincodes: "190001" })));
  assert.equal(contradiction.ok, false, "pincodes were listed against express: no");

  const ok = parseCatalogueCsv(file(row({ express: "yes", express_pincodes: "190001 190002" })));
  assert.equal(ok.ok, true, ok.ok ? "" : JSON.stringify(ok.issues));
  if (ok.ok) assert.deepEqual(ok.rows[0].expressPincodes, ["190001", "190002"]);
});

test("a pincode outside Srinagar is refused", () => {
  /* 110054 is Delhi, and it is what gets typed out of habit. Accepting it
     promises an hour to a city with no warehouse behind it. */
  const res = parseCatalogueCsv(file(row({ express: "yes", express_pincodes: "110054" })));
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.issues[0].message, /110054/);
});

test("a repeated pincode in one cell is collapsed, not an error", () => {
  /* Spaces separate, so no quoting is needed — which is why the template writes
     them that way. */
  const res = parseCatalogueCsv(
    file(row({ express: "yes", express_pincodes: "190001 190001 190002" }))
  );
  assert.equal(res.ok, true, res.ok ? "" : JSON.stringify(res.issues));
  if (res.ok) assert.deepEqual(res.rows[0].expressPincodes, ["190001", "190002"]);
});

test("a comma-separated pincode list works too, once quoted", () => {
  /* Unquoted it is two columns, and the parser says so rather than guessing.
     That message is the one a person needs, because the mistake is invisible in
     a spreadsheet. */
  const quoted = parseCatalogueCsv(
    file(row({ express: "yes", express_pincodes: '"190001, 190002"' }))
  );
  assert.equal(quoted.ok, true, quoted.ok ? "" : JSON.stringify(quoted.issues));
  if (quoted.ok) assert.deepEqual(quoted.rows[0].expressPincodes, ["190001", "190002"]);

  const unquoted = parseCatalogueCsv(
    file(row({ express: "yes", express_pincodes: "190001, 190002" }))
  );
  assert.equal(unquoted.ok, false);
  if (!unquoted.ok) assert.match(unquoted.issues[0].message, /quotes/);
});

test("the same product twice names the earlier line", () => {
  /* Two rows that differ only in capitalisation are still one product: they
     slugify to the same thing and the second would fail on the unique index
     halfway through the import. */
  const res = parseCatalogueCsv(file(row({ title: "White Cement" }), row({ title: "white cement" })));
  assert.equal(res.ok, false, "the same product was accepted twice");
  if (!res.ok) assert.match(res.issues[0].message, /line 2/);
});

test("a title a spreadsheet would execute is refused", () => {
  /* Stored happily, rendered as text on the storefront, and then run the moment
     somebody exports the catalogue and opens it in Excel. */
  for (const title of ['=HYPERLINK("http://x","Cement")', "+1+1", "-2+3", "@SUM(A1)"]) {
    const res = parseCatalogueCsv(file(row({ title: `"${title}"` })));
    assert.equal(res.ok, false, `${title} was accepted as a product name`);
  }
});

test("status is draft or published, and nothing else", () => {
  for (const s of ["archived", "live", ""]) {
    const res = parseCatalogueCsv(file(row({ status: s })));
    assert.equal(res.ok, false, `a status of "${s}" was accepted`);
  }
  for (const s of ["draft", "Published"]) {
    const res = parseCatalogueCsv(file(row({ status: s })));
    assert.equal(res.ok, true, `a status of "${s}" was refused`);
  }
});

test("brand, category, pack and unit are all required", () => {
  for (const column of ["brand", "category", "pack", "unit_label"]) {
    const res = parseCatalogueCsv(file(row({ [column]: "" })));
    assert.equal(res.ok, false, `a blank ${column} was accepted`);
    assert.ok(on(res, column).length > 0, `a blank ${column} was not blamed on its column`);
  }
});

test("every problem is reported at once, with the line it is on", () => {
  /* Reporting only the first means a person fixes one row, re-uploads, and
     finds the next — for as many rounds as there are mistakes. */
  const res = parseCatalogueCsv(
    file(
      row({ title: "Good Product One" }),
      row({ title: "Bad Price", price_rupees: "abc" }),
      row({ title: "Bad Status", status: "live" })
    )
  );
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.issues.length, 2, "not every problem was reported");
  assert.deepEqual(
    res.issues.map((i) => i.line).sort(),
    [3, 4],
    "the issues are not on the lines the mistakes are on"
  );
});

test("one row can carry more than one problem", () => {
  const res = parseCatalogueCsv(file(row({ price_rupees: "abc", status: "live", brand: "" })));
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(res.issues.length >= 3, "a row was abandoned after its first mistake");
});

test("comment lines are skipped wherever they are", () => {
  const res = parseCatalogueCsv(file("# a note", row(), "# another"));
  assert.equal(res.ok, true, res.ok ? "" : JSON.stringify(res.issues));
  if (res.ok) assert.equal(res.rows.length, 1);
});

test("a hash inside a title is just a character", () => {
  const res = parseCatalogueCsv(file(row({ title: "Grade #8 Wire" })));
  assert.equal(res.ok, true, res.ok ? "" : JSON.stringify(res.issues));
  if (res.ok) assert.equal(res.rows[0].title, "Grade #8 Wire");
});

test("the slug and sku are derived, so nobody has to invent 200 of them", () => {
  assert.equal(slugifyTitle("OPC 53 Grade Cement, 50 kg Bag"), "opc-53-grade-cement-50-kg-bag");
  assert.equal(slugifyTitle("  Spaces   &   Symbols!  "), "spaces-symbols");
  assert.equal(skuForSlug("ppc-cement-50kg"), "VE-PPC-CEMENT-50KG");

  const res = parseCatalogueCsv(file(row({ title: '"OPC 53 Grade Cement, 50 kg Bag"' })));
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.rows[0].slug, "opc-53-grade-cement-50-kg-bag");
    assert.equal(res.rows[0].sku, "VE-OPC-53-GRADE-CEMENT-50-KG-BAG");
  }
});

test("two long titles that shorten to the same item code are caught here", () => {
  /* A slug keeps 120 characters and a SKU keeps 48, so these two are different
     products with different web addresses and the same code. Unchecked, the
     second one violates the unique index halfway through the transaction and
     rolls the whole file back with an error that names no row. */
  const long = "Weatherproof Exterior Emulsion Ultra Premium";
  const a = `${long} Shade Alpha`;
  const b = `${long} Shade Beta`;
  assert.notEqual(slugifyTitle(a), slugifyTitle(b), "the two titles must differ as slugs");
  assert.equal(skuForSlug(slugifyTitle(a)), skuForSlug(slugifyTitle(b)), "the SKUs must collide");

  const res = parseCatalogueCsv(file(row({ title: a }), row({ title: b })));
  assert.equal(res.ok, false, "two products sharing an item code were accepted");
  if (!res.ok) assert.match(res.issues[0].message, /item code/);
});

test("a title with nothing to make an address from is refused", () => {
  const res = parseCatalogueCsv(file(row({ title: "!!!!" })));
  assert.equal(res.ok, false, "a product with no usable slug was accepted");
});

test("more rows than an import should carry in one go is refused", () => {
  const many = Array.from({ length: 2001 }, (_, i) => row({ title: `Product Number ${i}` }));
  const res = parseCatalogueCsv(file(...many));
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.issues[0].message, /at most/);
});
