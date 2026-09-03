import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Two claims that were false, in the two places a customer is most likely to
 * act on them: a document they might file with their accounts, and money they
 * are owed.
 *
 * Both had the same shape — software asserting something had happened, or was
 * something, when nothing behind it was true. That is the failure ISS-002 is
 * about, appearing twice more.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Source with comments stripped, so an explanation cannot satisfy an
 *  assertion about what the page renders. The `[^:"']` guard stops a `//`
 *  inside a string or URL reading as a comment. */
const rendered = (rel: string) =>
  readFileSync(join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");

const INVOICE = "app/(account)/account/orders/[orderNo]/invoice/page.tsx";

test("the order document does not call itself a tax invoice", () => {
  /* A GST tax invoice must carry the supplier's GSTIN, an HSN code per line and
     the place of supply. This page has none of them, and no Invoice model
     exists to number one from. A customer could reasonably have filed it. */
  const src = rendered(INVOICE);

  /* Case-sensitive on purpose. The badge is the uppercase label; the footer
     legitimately contains the lowercase phrase "not a GST tax invoice", and a
     case-insensitive match flagged the honest sentence as the defect — which
     it did on the first run of this test. */
  assert.ok(!/TAX INVOICE/.test(src), "the document still badges itself a tax invoice");
  assert.match(src, /ORDER SUMMARY/, "the badge no longer says what the document is");
  assert.ok(
    !/computer-generated tax invoice/i.test(src),
    "the footer still calls it a tax invoice"
  );
  assert.ok(
    /not a GST tax invoice/i.test(src),
    "the document does not say what it is not — the tax breakup above makes it " +
      "look like something it is not"
  );
});

test("the printed page is not headed a tax invoice", () => {
  /* The body was corrected first and the metadata title was not, which left the
     claim on the half that actually gets printed: browsers put document.title
     in the header of a printed page, and this page carries a Print button as
     its purpose. So Print produced a sheet headed "Tax Invoice" above a
     paragraph explaining that it is not one.

     Case-insensitive here, unlike the badge check above — a title is title-cased
     and "Tax Invoice" would slip past a case-sensitive match. */
  const src = readFileSync(join(ROOT, INVOICE), "utf8");
  const title = /title:\s*"([^"]*)"/.exec(src);
  assert.ok(title, "the invoice page has no metadata title");
  assert.ok(
    !/tax invoice/i.test(title[1]),
    `the page title is "${title[1]}", which prints as the header of the document`
  );
});

test("the order document invents no registered entity", () => {
  /* "Vertical Express Pvt Ltd, Commercial Hub, Lal Chowk" appeared nowhere else
     in the codebase, and the terms page lists business name, registered address,
     GSTIN and CIN as "[to be confirmed]". */
  const src = rendered(INVOICE);
  for (const invented of ["Pvt Ltd", "Private Limited", "Commercial Hub"]) {
    assert.ok(!src.includes(invented), `"${invented}" is asserted as a registered entity`);
  }
});

test("the order document invents no invoice number series", () => {
  /* A statutory invoice needs a sequential series per financial year. `INV-`
     prefixed to a non-sequential order number (ISS-028) is not one, and looks
     exactly like one. */
  assert.ok(!/INV-/.test(rendered(INVOICE)), "an invoice number series is being printed");
});

test("a refund never reports success without calling the gateway", () => {
  /* The Razorpay refund was `// Future placeholder` and `return true`. Every
     caller was told the money had gone back while nothing was asked of
     Razorpay — the dummy-gateway failure (ISS-002) pointed the other way, at a
     customer who is owed money. */
  const src = rendered("lib/services/payments.ts");

  assert.match(
    src,
    /payments\/\$\{encodeURIComponent\(paymentId\)\}\/refund/,
    "refundPayment no longer calls Razorpay's refund endpoint"
  );
  assert.ok(!/Future placeholder/.test(src), "the placeholder refund is back");

  /* Razorpay reports `processed` or `pending`; anything else, notably `failed`,
     must not read as success. */
  assert.match(src, /"processed"/, "the accepted refund statuses are no longer checked");
  assert.match(src, /RAZORPAY_REFUND_NOT_ACCEPTED/, "a non-accepted refund no longer throws");
});

test("a cash refund is not claimed to be automatable", () => {
  /* Cash going back to a customer is a person handing it over. Returning true
     would record a physical act as done by software (ISS-010). */
  assert.match(
    rendered("lib/services/payments.ts"),
    /COD_REFUND_NOT_AUTOMATABLE/,
    "the COD provider reports refunds as succeeding"
  );
});
