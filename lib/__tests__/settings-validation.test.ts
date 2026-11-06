import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFlag, parsePercent, parsePaise } from "@/lib/services/settings";

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
