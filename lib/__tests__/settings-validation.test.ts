import assert from "node:assert/strict";
import test from "node:test";

import { parseFlag, parsePercent, parsePaise } from "@/lib/services/settings";

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
