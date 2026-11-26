import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Two screens that must not lie about access or about money.
 *
 * The Payments screen now prints which gateway is live and whether each
 * Razorpay secret is present. That is useful and it is also the exact place a
 * secret would get leaked onto a page by somebody making it "more helpful" —
 * printing the last four characters of a key is the version of this that feels
 * harmless.
 *
 * The Staff screen renders the artboard's permission grid. The grid is what
 * these roles *should* be able to do; today there is one boolean and everybody
 * has it. Shown without that, it reads as access control that is in force,
 * and the rows it would be read wrongest on are margins, prices and refunds.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PAYMENTS = readFileSync(join(ROOT, "app/admin/payments/page.tsx"), "utf8");
const STAFF = readFileSync(join(ROOT, "app/admin/staff/page.tsx"), "utf8");

test("the payments screen reads presence, never a secret's value", () => {
  assert.ok(PAYMENTS.includes("RAZORPAY_WEBHOOK_SECRET"), "the secret check has gone");

  /* A secret may appear only inside a truthiness test. Slicing, masking or
     interpolating one is the thing being prevented — a masked key on a screen
     is still a key on a screen, and screens get screenshotted into chats.

     Checked by looking at what follows each mention: a permitted use is
     immediately a `?`, `&&`, `)` or line end. Anything else — `?.slice`,
     `??`, `}` closing a JSX expression — is the value escaping. */
  for (const secret of ["RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_KEY_ID"]) {
    for (const m of PAYMENTS.matchAll(new RegExp(`process\\.env\\.${secret}(.{0,12})`, "g"))) {
      const after = (m[1] ?? "").trimStart();
      assert.ok(
        after === "" || /^(\?[^.]|&&|\)|,)/.test(after),
        `${secret} is followed by "${after}" — it must only be tested for presence, ` +
          `never rendered, sliced or masked.`
      );
    }
  }
});

test("the staff matrix says the grid is not enforced", () => {
  const rendered = STAFF.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  assert.ok(rendered.includes("What each role can do"), "the matrix is gone");
  /* Asserted on the part of the page that sits with the grid, not on the
     whole file — the warning banner at the top already says "everyone", and
     matching that would let the grid itself lose its caveat and still pass. */
  const nearGrid = rendered.slice(rendered.indexOf("What each role can do"));
  assert.ok(
    /enforced/i.test(nearGrid) && /should/i.test(nearGrid),
    "the permission grid is rendered without saying, beside it, that none of it " +
      "is enforced. As drawn it describes access control that does not exist."
  );
  assert.ok(
    /Today/.test(nearGrid),
    "the grid has no column showing the access people actually have"
  );
});

test("the staff matrix is a full grid, not a sample", () => {
  /* Eleven permissions across five roles in the artboard. A trimmed matrix
     would quietly drop whichever row was inconvenient — "See cost and margin"
     being the one that matters. */
  const rows = STAFF.match(/\["[^"]+", (?:true|false), (?:true|false), (?:true|false), (?:true|false), (?:true|false)\]/g) ?? [];
  assert.ok(rows.length >= 11, `expected at least 11 permission rows, found ${rows.length}`);
  assert.ok(
    STAFF.includes("See cost and margin") && STAFF.includes("Change prices"),
    "the two rows that matter most are missing from the matrix"
  );
});
