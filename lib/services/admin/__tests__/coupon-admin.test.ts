import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { adminListCoupons } from "@/lib/services/admin/coupons";
import { db } from "@/lib/db";

/**
 * The coupon console: what it reports, and what it must never let through.
 *
 * The action itself needs an admin session and cannot be called from here, so
 * what is tested is the reader (which drives every number on the screen) and
 * the shape of the write path's rules, asserted on source where the risk is a
 * rule being dropped rather than a value being wrong.
 */
const P = "ZZZADMIN";
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

async function cleanup() {
  const orders = await db.order.findMany({
    where: { orderNo: { startsWith: P } },
    select: { id: true },
  });
  await db.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
  await db.user.deleteMany({ where: { email: { startsWith: P.toLowerCase() } } });
  await db.coupon.deleteMany({ where: { code: { startsWith: P } } });
}

test("usage and spend are counted from real orders", async (t) => {
  t.after(cleanup);
  await cleanup();

  const code = `${P}-${randomUUID().slice(0, 6)}`.toUpperCase();
  await db.coupon.create({
    data: { code, type: "flat", value: 10_000, usageLimit: 5, perUserLimit: 9 },
  });
  const user = await db.user.create({
    data: { id: randomUUID(), email: `${P.toLowerCase()}@example.invalid` },
  });

  const place = (status: "delivered" | "cancelled", discount: number) =>
    db.order.create({
      data: {
        orderNo: `${P}-${randomUUID().slice(0, 8)}`,
        userId: user.id,
        address: {},
        status,
        paymentMethod: "dummy",
        subtotalPaise: 100_000,
        discountPaise: discount,
        totalPaise: 100_000 - discount,
        couponCode: code,
      },
    });

  await place("delivered", 10_000);
  await place("delivered", 10_000);
  await place("cancelled", 10_000);

  const row = (await adminListCoupons()).find((c) => c.code === code);
  assert.ok(row, "the coupon vanished from the console list");

  /* Cancelled orders are excluded — the same rule the eligibility check uses.
     If these two ever disagreed the screen would show a limit that binds at a
     different number than the one it displays. */
  assert.equal(row.redeemed, 2, "cancelled orders are being counted as redemptions");
  assert.equal(row.discountedPaise, 20_000, "the amount given away is wrong");
});

test("a coupon nobody has used reports zero, not null", async (t) => {
  t.after(cleanup);
  await cleanup();
  const code = `${P}-${randomUUID().slice(0, 6)}`.toUpperCase();
  await db.coupon.create({ data: { code, type: "percent", value: 10 } });

  const row = (await adminListCoupons()).find((c) => c.code === code);
  assert.equal(row?.redeemed, 0);
  assert.equal(row?.discountedPaise, 0);
});

test("the console counts redemptions the same way eligibility does", () => {
  /* Both read Order.couponCode and both exclude cancelled orders. Asserted on
     source because the failure is a divergence between two files, which no
     single query observes: a screen saying "3 of 5 used" while the checkout
     believes 4 have been is worse than either number alone. */
  /* Comments stripped. The first version of this matched the doc comment
     saying "excluding cancelled orders" — so deleting the filter and leaving
     the prose passed, which is the whole failure it was meant to catch. The
     `[^:"']` guard keeps a `//` inside a string from reading as a comment. */
  const strip = (rel: string) =>
    readFileSync(join(ROOT, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");

  const admin = strip("lib/services/admin/coupons.ts");
  const rules = strip("lib/services/coupon-eligibility.ts");
  for (const src of [admin, rules]) {
    assert.match(src, /couponCode/, "a counter stopped reading Order.couponCode");
    assert.match(src, /cancelled/, "a counter stopped excluding cancelled orders");
  }
});

test("the write path refuses money it cannot parse", () => {
  /* parseRupeeInput is the boundary; Number() on a money field turns "" into
     zero and "1e3" into a thousand rupees. This asserts the action uses the
     parser rather than coercing. */
  const src = readFileSync(join(ROOT, "actions/coupons.ts"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    " "
  );
  assert.match(src, /parseRupeeInput/, "the coupon action no longer parses money strictly");

  /* Only the money fields. `Number(v.value)` in the percent branch is correct —
     a percentage is not money, and banning it there would be a guard that
     misunderstands what it guards. The fields below are always rupees. */
  for (const moneyField of ["minOrder", "maxDiscount"]) {
    assert.ok(
      !new RegExp(`Number\\(\\s*v\\.${moneyField}`).test(src),
      `${moneyField} is coerced with Number() instead of parsed as a rupee amount`
    );
    assert.ok(
      new RegExp(`parseRupeeInput\\(v\\.${moneyField}`).test(src),
      `${moneyField} does not go through parseRupeeInput`
    );
  }

  /* A flat discount IS money, so its value must be parsed, not coerced. */
  assert.match(
    src,
    /"flat"\s*\?\s*parseRupeeInput\(v\.value\)/,
    "a flat discount amount is not parsed as a rupee amount"
  );
});

test("nothing in the coupon write path deletes a coupon", () => {
  /* Orders reference the code as a string. Deleting one turns every order that
     used it into a discount with no explanation. */
  const src = readFileSync(join(ROOT, "actions/coupons.ts"), "utf8");
  assert.ok(
    !/coupon\.delete/.test(src),
    "the console can delete a coupon; orders reference the code and would lose their reason"
  );
});

test("create and edit are separate, so adding cannot overwrite", () => {
  /* The bug this prevents already shipped once, on brands: an upsert keyed on
     the code means adding a coupon whose code exists rewrites the live one's
     terms and reports success. */
  const src = readFileSync(join(ROOT, "actions/coupons.ts"), "utf8");
  assert.ok(!/coupon\.upsert/.test(src), "coupons are saved with an upsert keyed on the code");
  assert.match(src, /originalCode/, "there is no way to tell an edit from a create");
});
