/**
 * Shipment splitting.
 *
 * The rule that decides how an order splits is the same rule the storefront shows
 * on every product card. If the two diverge, the cart tells a customer their
 * cement is coming with their wire and it is not — which is precisely the fault
 * the whole mixed-fulfilment design exists to prevent. These tests pin the rule.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { planShipments } from "../shipments";

test("Shipments: an all-express order becomes one shipment", () => {
  const planned = planShipments([
    { ref: "wire", qty: 2, categoryIsBulk: false },
    { ref: "switch", qty: 6, categoryIsBulk: false },
  ]);

  assert.equal(planned.length, 1);
  assert.equal(planned[0].speedClass, "express");
  assert.equal(planned[0].sequence, 1);
  assert.deepEqual(
    planned[0].lines.map((l) => l.ref),
    ["wire", "switch"]
  );
});

test("Shipments: an all-heavy order becomes one shipment, still sequence 1", () => {
  const planned = planShipments([
    { ref: "cement", qty: 34, categoryIsBulk: true },
    { ref: "tile", qty: 12, categoryIsBulk: true },
  ]);

  assert.equal(planned.length, 1);
  assert.equal(planned[0].speedClass, "scheduled");
  assert.equal(
    planned[0].sequence,
    1,
    "a single shipment is always 1, never 2 — the customer should not see 'Shipment 2 of 1'"
  );
});

test("Shipments: a mixed order splits, with express first", () => {
  const planned = planShipments([
    { ref: "cement", qty: 34, categoryIsBulk: true },
    { ref: "wire", qty: 2, categoryIsBulk: false },
    { ref: "tile", qty: 12, categoryIsBulk: true },
    { ref: "switch", qty: 1, categoryIsBulk: false },
  ]);

  assert.equal(planned.length, 2);

  const [first, second] = planned;
  assert.equal(first.speedClass, "express", "the delivery that arrives today comes first");
  assert.equal(first.sequence, 1);
  assert.deepEqual(
    first.lines.map((l) => l.ref),
    ["wire", "switch"]
  );

  assert.equal(second.speedClass, "scheduled");
  assert.equal(second.sequence, 2);
  assert.deepEqual(
    second.lines.map((l) => l.ref),
    ["cement", "tile"]
  );
});

test("Shipments: every line lands in exactly one shipment, with its quantity intact", () => {
  const lines = [
    { ref: "cement", qty: 34, categoryIsBulk: true },
    { ref: "wire", qty: 2, categoryIsBulk: false },
    { ref: "tile", qty: 12, categoryIsBulk: true },
  ];
  const planned = planShipments(lines);

  const placed = planned.flatMap((s) => s.lines);
  assert.equal(placed.length, lines.length, "no line may be dropped or duplicated");

  for (const line of lines) {
    const matches = placed.filter((p) => p.ref === line.ref);
    assert.equal(matches.length, 1, `${line.ref} should appear exactly once`);
    assert.equal(matches[0].qty, line.qty, `${line.ref} quantity must survive the split`);
  }
});

test("Shipments: zero-quantity lines are not shipped", () => {
  const planned = planShipments([
    { ref: "wire", qty: 0, categoryIsBulk: false },
    { ref: "cement", qty: 5, categoryIsBulk: true },
  ]);

  assert.equal(planned.length, 1);
  assert.equal(planned[0].speedClass, "scheduled");
  assert.equal(planned[0].sequence, 1);
});

test("Shipments: an empty cart plans nothing", () => {
  assert.deepEqual(planShipments([]), []);
});
