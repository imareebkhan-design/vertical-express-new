import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The business does not state contact details it has not confirmed.
 *
 * Three surfaces disagreed about where the business is:
 *
 *   the footer said "Lal Chowk, Srinagar, J&K 190001",
 *   lib/data.ts said "Residency Road, Lal Chowk" (rendered nowhere),
 *   and the contact and terms pages both say the registered address is
 *   "[to be published]".
 *
 * The same pattern as the invoice and the downloads strip: an honest detail
 * page sitting behind a summary surface that asserts what the detail page says
 * is unknown. Whoever wrote the footer was not lying — they were filling a slot
 * that wanted an address.
 *
 * The opening hours were the sharper version. The contact page brackets the
 * phone number as "[number to be published]" and in the same breath told people
 * to call during opening hours. You cannot ring a number that does not exist,
 * and somebody travelling to a Lal Chowk address at 7pm makes a wasted journey.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const rendered = (rel: string) =>
  readFileSync(join(ROOT, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");

const footer = rendered("components/sections/footer.tsx");
const content = rendered("lib/content.ts");
const data = rendered("lib/data.ts");

test("the footer still renders contact details", () => {
  /* Non-vacuity. */
  assert.match(footer, /Get in touch/, "the contact block has gone from the footer");
  assert.match(footer, /Srinagar/, "the footer no longer says where we operate");
});

test("no surface states a street address the legal pages call unconfirmed", () => {
  /* Srinagar and Jammu & Kashmir are the confirmed market and stay. What must
     not appear is a specific locality or building presented as our address. */
  for (const [name, src] of [
    ["footer", footer],
    ["lib/data.ts", data],
  ] as const) {
    assert.ok(
      !/Lal Chowk|Residency Road|Commercial Hub/.test(src),
      `${name} states a street address; terms and contact both say it is to be published`
    );
  }
});

test("opening hours are not asserted as fact", () => {
  /* Nobody set them, and a support-hours promise is an SLA like any other. */
  for (const [name, src] of [
    ["footer", footer],
    ["content", content],
  ] as const) {
    assert.ok(
      !/8\s*(?:AM|am)\s*[–-]\s*8\s*(?:PM|pm)|8am to 8pm/.test(src),
      `${name} states opening hours that nobody confirmed`
    );
  }
});

test("the contact page still brackets what it cannot publish", () => {
  /* The convention that made this findable in the first place. If these stop
     being bracketed it means somebody invented values rather than obtained
     them. */
  assert.match(content, /number to be published/, "the phone number is no longer marked pending");
  assert.match(
    content,
    /address to be published/,
    "the registered address is no longer marked pending"
  );
});
