import assert from "node:assert/strict";
import test from "node:test";
import { CONTENT } from "@/lib/content";

/**
 * The policy pages must not offer what the shop refuses.
 *
 * `lib/content.ts` holds terms, shipping, returns, privacy, how-we-work and the
 * FAQ in one object, and it disagreed with itself in four places. The FAQ was
 * the clearest: one answer said "Add your GSTIN at checkout and it will appear
 * on every invoice after that", and an answer further down the same page said
 * "we are not collecting a GSTIN at checkout". A business customer reads the
 * first, goes looking for a field that does not exist, and has already decided
 * what the order is worth to them on the strength of input credit they cannot
 * claim.
 *
 * Verified against the code, not against the other copy:
 *   GSTIN     — checkout-view.tsx marks it pending ("we are not collecting a
 *               GSTIN"), Order has no gstin column, there is no Invoice model.
 *   COD       — switched off shop-wide; lib/services/checkout.ts:130 and :209
 *               refuse it. `settings` is empty, so nothing turns it on.
 *   Slots     — no slot model, screen or checkout step exists (ISS-057). The
 *               returns page named "a missed slot" as a fault entitling a
 *               delivery-charge refund.
 *   Wallet    — never referenced in checkout or cart, and no refund_credit is
 *               written anywhere, so a refund cannot reach it.
 *
 * These are one-directional: a page may say a thing is *not* available. What it
 * may not do is instruct a customer to use it.
 */

/** Every line of body copy across every policy document, with the page and
 *  section it came from, so a failure names where to look. */
const LINES: { where: string; text: string }[] = Object.entries(CONTENT).flatMap(
  ([doc, page]) => [
    ...(page.intro ? [{ where: `${doc}#intro`, text: page.intro }] : []),
    ...(page.pending ? [{ where: `${doc}#pending`, text: page.pending }] : []),
    ...page.sections.flatMap((s) =>
      s.body.map((text) => ({ where: `${doc}#${s.id}`, text }))
    ),
  ]
);

test("every policy document is still readable", () => {
  /* Non-vacuity: if CONTENT changes shape and LINES comes out empty, every
     assertion below passes without reading anything. */
  assert.ok(LINES.length > 40, `only ${LINES.length} lines of policy copy found`);
  assert.ok(LINES.some((l) => l.where.startsWith("terms#")), "the terms have gone");
  assert.ok(LINES.some((l) => l.where.startsWith("faq#")), "the FAQ has gone");
});

test("no policy page tells a customer to supply a GSTIN", () => {
  /* Checkout does not collect it and no document can carry it. Telling someone
     to add it is worse than silence: it is the reason they chose to buy here. */
  for (const { where, text } of LINES) {
    assert.ok(
      !/add your gstin|enter your gstin|gstin at checkout and it will/i.test(text),
      `${where} tells a customer to add a GSTIN: "${text.slice(0, 90)}…"`
    );
  }
});

test("no policy page promises a GST invoice", () => {
  /* There is no Invoice model and no GSTIN is set. The document a customer can
     print is an order summary and says so. */
  for (const { where, text } of LINES) {
    if (/not issuing|cannot|not yet|we are not/i.test(text)) continue; // a denial is fine
    assert.ok(
      !/(will|does) appear on (the|every) invoice|your invoice shows/i.test(text),
      `${where} promises a GST invoice: "${text.slice(0, 90)}…"`
    );
  }
});

test("the privacy notice names every identifier the app stores", () => {
  /* "What we collect" listed phone, name, addresses, order history and GSTIN,
     and not the email address. `User.email` is a unique column, Google sign-in
     is one of the two methods on the login screen, and six of seven users in
     the demo database carry one. It is not merely stored: actions/checkout.ts
     sends an order confirmation to it through Resend, so a third-party
     processor receives it too.

     A data-protection notice that omits an identifier the system collects,
     stores and transmits is wrong in the one document whose entire purpose is
     to be complete. */
  const privacy = LINES.filter((l) => l.where.startsWith("privacy#"))
    .map((l) => l.text)
    .join(" ");

  assert.ok(privacy.length > 200, "the privacy copy has gone");
  for (const [what, pattern] of [
    ["the phone number", /phone number/i],
    ["the email address", /email address/i],
    ["delivery addresses", /delivery address/i],
    ["order history", /order history/i],
    ["the GSTIN", /gstin/i],
  ] as const) {
    assert.match(privacy, pattern, `the privacy notice does not mention ${what}`);
  }
});

test("no policy page offers cash on delivery as a way to pay", () => {
  /* COD is refused at checkout. Every other surface — how-we-work, two FAQ
     answers — already says so; the terms offered it anyway, with the ceiling in
     brackets, as though the bracket rescued the offer. */
  for (const { where, text } of LINES) {
    assert.ok(
      !/you may pay .*in cash|pay (in )?cash (or by upi )?to the driver|cash or upi to the driver/i.test(text),
      `${where} offers payment in cash at the gate: "${text.slice(0, 90)}…"`
    );
  }
});

test("no policy page treats a cash-on-delivery order as something that exists", () => {
  /* The returns page routed COD refunds to the wallet. No COD order can be
     placed, the wallet is not wired into checkout, and no refund_credit is ever
     written — so the route was fictional twice over. */
  for (const { where, text } of LINES) {
    if (/switched off|no cash on delivery|not at the moment|when it comes back/i.test(text)) continue;
    assert.ok(
      !/cash-on-delivery orders are|cod orders are/i.test(text),
      `${where} describes what happens to a COD order: "${text.slice(0, 90)}…"`
    );
  }
});

test("no policy page treats a delivery slot as a thing a customer has", () => {
  /* Slots do not exist in any form (ISS-057) — no model, no screen, no checkout
     step. how-we-work says so in two places; the returns page named "a missed
     slot" as a fault that earns a refund. */
  for (const { where, text } of LINES) {
    if (/not built yet|is not built|not available today/i.test(text)) continue;
    assert.ok(
      !/missed slot|your slot|the slot you|slot you (pick|choose)/i.test(text),
      `${where} refers to a delivery slot as existing: "${text.slice(0, 90)}…"`
    );
  }
});
