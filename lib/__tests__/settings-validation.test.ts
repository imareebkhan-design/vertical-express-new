import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFlag, parsePercent, parsePaise, freeDeliveryInputToStored, parseFreeDeliveryThresholdPaise } from "@/lib/services/settings";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The parsers standing between a typed field and a business rule.
 *
 * These values pay money out, print on a tax document, and tell a customer when
 * their cement arrives. The failure that matters is not rejection — it is a
 * malformed value quietly becoming a plausible one, because that reaches
 * production without anybody deciding it.
 *
 * The rule throughout: unparseable is null, and null means the safe default.
 * Never a guess.
 */

test("a percentage is a percentage, or it is nothing", () => {
  assert.equal(parsePercent("5"), 5);
  assert.equal(parsePercent("2.5"), 2.5);
  assert.equal(parsePercent("0"), 0, "zero is a real answer: the programme exists and pays nothing");
  assert.equal(parsePercent("100"), 100);

  for (const bad of ["banana", "-1", "101", "5%", "", "  ", null, undefined]) {
    assert.equal(parsePercent(bad), null, `${JSON.stringify(bad)} must not become a rate`);
  }
});

test("blank is distinguishable from zero", () => {
  /* The whole reason the read path treats null as "off": a shopkeeper who has
     never set a cashback rate and one who has deliberately set it to zero are
     saying different things, and only one of them has a programme. */
  assert.equal(parsePercent(""), null);
  assert.equal(parsePercent("0"), 0);
  assert.notEqual(parsePercent(""), parsePercent("0"));
});

test("paise are whole and not negative", () => {
  assert.equal(parsePaise("50000"), 50000);
  assert.equal(parsePaise("0"), 0);
  for (const bad of ["12.5", "-100", "lots", "", null]) {
    assert.equal(parsePaise(bad), null, `${JSON.stringify(bad)} must not become an amount`);
  }
});

test("only an explicit yes is a yes", () => {
  /* This one gates cash collection. Anything ambiguous has to read as off,
     because the cost of a false positive is a driver at a gate with no float
     and no way to record what he was handed. */
  assert.equal(parseFlag("true"), true);
  for (const notYes of ["TRUE", "True", "yes", "1", "on", "", " true", null, undefined]) {
    assert.equal(parseFlag(notYes), false, `${JSON.stringify(notYes)} must not enable anything`);
  }
});

/**
 * The express delivery charge — settable, or express is not offered.
 *
 * `components/admin/listing-form.tsx` tells the operator, next to the
 * 60-minute switch, that "the express charge is set once for the whole shop in
 * Settings". It was not on that screen when that sentence was written, which
 * would have made it the same kind of claim this whole audit has been removing:
 * a screen describing a control that does not exist.
 *
 * Blank means express is not offered at all, and must not read as free.
 */
test("the express charge is on the settings screen at all", () => {
  const form = readFileSync(
    join(ROOT, "components/admin/settings-form.tsx"),
    "utf8"
  );
  const page = readFileSync(join(ROOT, "app/admin/settings/page.tsx"), "utf8");
  const action = readFileSync(join(ROOT, "actions/settings.ts"), "utf8");

  /* The binding, not the identifier. The first version of this matched the type
     declaration at the top of the file, so deleting the whole field still
     passed — the same "checked the wrong half" mistake this test exists to
     prevent on the screen it describes. */
  assert.match(
    form,
    /values\.expressFeeRupees/,
    "the settings form declares the express charge but renders no field for it"
  );
  assert.match(
    form,
    /set\("expressFeeRupees"\)/,
    "the express charge field is rendered but cannot be edited"
  );
  assert.match(page, /expressFeePaise/, "the settings page never reads the stored charge");
  assert.match(action, /expressFeePaise/, "the settings action never writes the charge");
});

test("the listing screen does not describe a control that is missing", () => {
  /* The pairing that matters: if the field is ever removed from Settings, the
     sentence on the listing screen becomes false and this fails. */
  const listing = readFileSync(join(ROOT, "components/admin/listing-form.tsx"), "utf8");
  if (/express charge is set once/i.test(listing)) {
    const form = readFileSync(join(ROOT, "components/admin/settings-form.tsx"), "utf8");
    assert.match(
      form,
      /Express delivery charge/,
      "the listing screen sends the operator to Settings for a field that is not there"
    );
  }
});

test("a blank express charge is not a free one", () => {
  /* Absent means not offered. Zero would mean offered at no cost — a standing
     commitment nobody agreed to, which is the cashback defect again. */
  const service = readFileSync(join(ROOT, "lib/services/express-delivery.ts"), "utf8");
  assert.match(service, /no_price/, "an unpriced express service no longer refuses");
  assert.ok(
    !/expressFeePaise[^\n]*\?\?\s*0/.test(service),
    "the express fee falls back to zero, which reads as free delivery"
  );
});

/**
 * The free-delivery threshold — the owner's figure, or no offer (ISS-030).
 *
 * It was a hardcoded ₹500 in the cart service. Waiving a delivery fee costs the
 * business money on every qualifying order, so the field has three answers and
 * no fourth: blank (no offer), a rupee amount above zero (stored as paise), or
 * refused. The amounts below are fixtures, not proposed thresholds.
 */
test("the free-delivery field: blank is unset, a rupee amount is stored as paise", () => {
  assert.equal(freeDeliveryInputToStored(""), "", "blank must store as unset");
  assert.equal(freeDeliveryInputToStored("   "), "", "whitespace is blank");
  assert.equal(freeDeliveryInputToStored("750"), "75000");
  assert.equal(freeDeliveryInputToStored(" 750 "), "75000");
  assert.equal(freeDeliveryInputToStored("1,250"), "125000");
  assert.equal(freeDeliveryInputToStored("999.5"), "99950");
  assert.equal(freeDeliveryInputToStored("0.01"), "1", "one paisa is above zero");
});

test("the free-delivery field refuses zero, negatives and anything that is not an amount", () => {
  /* Zero would mean "every delivery is free" — a standing cost that must be
     typed as a real figure on purpose, not arrive by clearing a field to 0. */
  for (const bad of ["0", "0.00", "-1", "-750", "abc", "₹750", "7.505", "1e3", "750 rupees"]) {
    assert.equal(freeDeliveryInputToStored(bad), null, `${JSON.stringify(bad)} must be refused`);
  }
});

test("a stored free-delivery threshold is plain digits above zero, or it is no offer", () => {
  assert.equal(parseFreeDeliveryThresholdPaise("75000"), 75000);
  assert.equal(parseFreeDeliveryThresholdPaise(" 75000 "), 75000);
  /* Stricter than parsePaise on purpose: Number() would accept the last three. */
  for (const bad of ["", "  ", "0", "-75000", "abc", "12.5", "1e5", "75000.00", "0x10", null, undefined]) {
    assert.equal(parseFreeDeliveryThresholdPaise(bad), null, `${JSON.stringify(bad)} must not become a threshold`);
  }
});

test("the settings screen shows the threshold through the cart's parser, not Number()", () => {
  /* The screen used `Number(stored) / 100`, which shows a hand-edited "1e5" as
     ₹1000. The cart refuses that value, but saving the form — for any reason —
     would then have written it back as a valid, live threshold. */
  const page = readFileSync(join(ROOT, "app/admin/settings/page.tsx"), "utf8");
  assert.match(
    page,
    /parseFreeDeliveryThresholdPaise\(s\[SETTING_KEYS\.freeDeliveryThresholdPaise\]\)/,
    "the settings page reads the stored threshold without the strict parser"
  );
  assert.ok(
    !/Number\(s\[SETTING_KEYS\.freeDeliveryThresholdPaise\]\)/.test(page),
    "the settings page converts the stored threshold with Number()"
  );
});

test("the free-delivery threshold is on the settings screen and saved through the validated path", () => {
  const form = readFileSync(join(ROOT, "components/admin/settings-form.tsx"), "utf8");
  const page = readFileSync(join(ROOT, "app/admin/settings/page.tsx"), "utf8");
  const action = readFileSync(join(ROOT, "actions/settings.ts"), "utf8");
  const cart = readFileSync(join(ROOT, "lib/services/cart.ts"), "utf8");

  assert.match(form, /values\.freeDeliveryRupees/, "the form renders no free-delivery field");
  assert.match(form, /set\("freeDeliveryRupees"\)/, "the free-delivery field cannot be edited");
  assert.match(page, /freeDeliveryThresholdPaise/, "the settings page never reads the stored threshold");
  assert.match(
    action,
    /refine\(\(v\) => freeDeliveryInputToStored\(v\) !== null/,
    "the action no longer refuses what the parser refuses"
  );
  assert.match(
    action,
    /SETTING_KEYS\.freeDeliveryThresholdPaise,\s*(\/\*[^*]*\*\/\s*)?freeDeliveryInputToStored\(/,
    "the action does not store the parsed paise"
  );
  assert.ok(
    !/FREE_DELIVERY_THRESHOLD_PAISE|=\s*50_?000\b/.test(cart),
    "a hardcoded free-delivery threshold is back in the cart service"
  );
});
