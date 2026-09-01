import assert from "node:assert/strict";
import test from "node:test";

import { db } from "@/lib/db";
import { computeTotals } from "@/lib/services/checkout";
import type { CartSummary } from "@/lib/services/cart";

/**
 * Cash on delivery is off until somebody turns it on.
 *
 * Collecting cash is not a payment method, it is an operation: a driver, a
 * float, a handover record and a daily reconciliation. None of those exist —
 * the COD cash screen in the console says so itself — so offering it at
 * checkout promises something nobody can fulfil at the gate.
 *
 * Two gates now gate it. The pincode gate was always there: some areas we will
 * not send cash to. The business gate is new, and defaults closed, because an
 * unconfigured system must not offer to take money it cannot handle.
 */
const EMPTY_CART: CartSummary = {
  lines: [],
  subtotalPaise: 0,
  itemCount: 0,
} as unknown as CartSummary;

async function codAllowedFor(setting: string | null) {
  if (setting === null) {
    await db.setting.deleteMany({ where: { key: "cod.enabled" } });
  } else {
    await db.setting.upsert({
      where: { key: "cod.enabled" },
      create: { key: "cod.enabled", value: setting },
      update: { value: setting },
    });
  }
  const pincode = await db.serviceablePincode.findFirst({
    where: { isActive: true, codAllowed: true },
    select: { pincode: true },
  });
  if (!pincode) return null; // no serviceable COD pincode seeded; nothing to assert
  const totals = await computeTotals(EMPTY_CART, pincode.pincode, "Jammu & Kashmir");
  return totals.codAllowed;
}

test.after(async () => {
  await db.setting.deleteMany({ where: { key: "cod.enabled" } });
});

test("with no setting, cash on delivery is not offered", async () => {
  /* THE DEFAULT THAT MATTERS. An unconfigured system must not offer to take
     cash it has no process for collecting. */
  const allowed = await codAllowedFor(null);
  if (allowed === null) return; // no COD-eligible pincode in this database
  assert.equal(allowed, false, "an unset switch must read as off, not as on");
});

test("a pincode that allows cash still does not offer it while the switch is off", async () => {
  const allowed = await codAllowedFor("false");
  if (allowed === null) return;
  assert.equal(allowed, false, "the business gate overrides the pincode gate");
});

test("turning it on in the console offers it where the pincode permits", async () => {
  const allowed = await codAllowedFor("true");
  if (allowed === null) return;
  assert.equal(allowed, true, "both gates open means cash is offered");
});

test("anything other than an explicit yes reads as off", async () => {
  for (const odd of ["", "yes", "1", "TRUE", "maybe"]) {
    const allowed = await codAllowedFor(odd);
    if (allowed === null) return;
    assert.equal(allowed, false, `"${odd}" must not enable cash collection`);
  }
});
