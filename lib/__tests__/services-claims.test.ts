import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * /services must not describe a booking process this system does not run.
 *
 * Services are a separate business at verticalconstruction.in — the owner's
 * decision, stated on the terms page. This route is a signpost to it. It
 * nonetheless asserted, in the present tense, that professionals are vetted
 * here, that a match returns three of them with availability and a written
 * scope, and that the resulting work is tracked "from the same account you
 * order material on".
 *
 * The last one is the one that costs a customer something. The booking is taken
 * on another site against another database; nothing writes into `bookings` from
 * there. /account/bookings can only ever be empty, and its own empty state used
 * to promise the opposite.
 *
 * Evidence, demo database: professionals 0, services 0, bookings 0. The one
 * write path — submitBooking <- BookingModal <- ServiceCard <-
 * ServiceCategoriesSection — is rendered by no route.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Rendered copy only. The doc comment on the page explains each removed claim
 *  by quoting it, and must not itself trip these checks. */
function copy(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");
}

const services = copy("app/services/page.tsx");
const bookings = copy("app/(account)/account/bookings/page.tsx");

test("the services page still renders its copy", () => {
  /* Non-vacuity: an over-eager comment stripper would empty the file and make
     every assertion below pass. */
  assert.match(services, /What you can book/, "the services copy has gone");
  assert.match(bookings, /No service bookings yet/, "the bookings copy has gone");
});

test("no professional is claimed to be vetted", () => {
  /* `professionals.is_verified` defaults to false and the table has no column
     for a licence, a past site or a reference. There is nothing to vet against
     and no row to vet. */
  for (const claim of [
    /verified before they appear/i,
    /a reference we actually called/i,
    /verified professionals/i,
    /done the work before/i,
  ]) {
    assert.ok(
      !claim.test(services),
      `/services claims professionals are vetted here: ${claim}`
    );
  }
});

test("no count of matched professionals is promised", () => {
  /* "up to three" was a number nobody set, for a matching step that runs on
     another site. */
  assert.ok(
    !/up to (one|two|three|four|five|\d+)\s+\w*\s*professionals/i.test(services),
    "/services promises a number of matched professionals"
  );
});

test("a service booking is not said to be tracked in this account", () => {
  /* The booking is taken on verticalconstruction.in, which cannot write to this
     database. Saying it lands beside the material orders is the one claim here
     a customer would act on. */
  assert.ok(
    !/same account you order material on/i.test(services),
    "/services says a booking is tracked in the material-orders account"
  );
  assert.ok(
    !/(it'll|it will|they'll|they will) appear here/i.test(bookings),
    "the bookings empty state promises off-site bookings will appear"
  );
  assert.match(
    bookings,
    /not linked to this account/i,
    "the bookings empty state must say why it stays empty"
  );
});

test("the page still says where a booking is actually arranged", () => {
  /* Removing the false process must not leave a page that offers a booking and
     never says where it happens. */
  assert.match(
    services,
    /services site/i,
    "/services no longer points at the site that takes the booking"
  );
});
