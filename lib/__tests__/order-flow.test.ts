import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ORDER_FLOW,
  nextOrderStatuses,
  canTransitionOrder,
  isCancellable,
} from "@/lib/order-flow";

/**
 * One order state machine, in one place.
 *
 * ISS-014 was raised because the admin control accepted any status —
 * `delivered -> pending_payment` included. That was guarded, but the map lived
 * inside the admin service while three other paths wrote a status with their
 * own inline copy of the rule:
 *
 *   orders.ts    `["pending_payment", "confirmed"].includes(order.status)`
 *   checkout.ts  `order.status !== "pending_payment"`
 *   the webhook  `existingPayment.order.status === "pending_payment"`
 *
 * Every one agreed with the map, so nothing was broken and nothing would have
 * told us when it stopped agreeing. The customer cancel path is the one most
 * likely to be edited by someone reading only that file, and the one where a
 * wrong answer is visible to a customer.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const ALL = Object.keys(ORDER_FLOW) as (keyof typeof ORDER_FLOW)[];

test("the machine still describes the whole enum", () => {
  /* Non-vacuity, and a real check: a status added to the schema and not to the
     map has no legal move out of it, which reads as "terminal" rather than
     "forgotten". */
  const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
  const block = /enum OrderStatus \{([^}]*)\}/.exec(schema);
  assert.ok(block, "OrderStatus has gone from the schema");
  const fromSchema = block[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*/, "").trim())
    .filter(Boolean);

  assert.deepEqual(
    [...ALL].sort(),
    [...fromSchema].sort(),
    "ORDER_FLOW and the OrderStatus enum have diverged"
  );
});

test("an order cannot go backwards", () => {
  /* The defect in the issue, exactly. */
  assert.equal(canTransitionOrder("delivered", "pending_payment"), false);
  assert.equal(canTransitionOrder("delivered", "confirmed"), false);
  assert.equal(canTransitionOrder("out_for_delivery", "packed"), false);
  assert.equal(canTransitionOrder("packed", "confirmed"), false);
  assert.equal(canTransitionOrder("cancelled", "confirmed"), false);
});

test("the forward path a real order takes is legal end to end", () => {
  const journey = [
    "pending_payment",
    "confirmed",
    "packed",
    "out_for_delivery",
    "delivered",
  ] as const;
  for (let i = 0; i < journey.length - 1; i++) {
    assert.ok(
      canTransitionOrder(journey[i], journey[i + 1]),
      `${journey[i]} -> ${journey[i + 1]} is refused, so no order can complete`
    );
  }
});

test("cancelling is allowed before dispatch and not after", () => {
  /* Derived from the map rather than asserted separately — this is what the
     customer path now calls. Cancelling after the goods are on a vehicle is a
     driver problem, not a button. */
  assert.equal(isCancellable("pending_payment"), true);
  assert.equal(isCancellable("confirmed"), true);
  assert.equal(isCancellable("packed"), false);
  assert.equal(isCancellable("out_for_delivery"), false);
  assert.equal(isCancellable("delivered"), false);
});

test("terminal states are terminal", () => {
  for (const terminal of ["delivered", "cancelled", "refunded"] as const) {
    assert.deepEqual(nextOrderStatuses(terminal), [], `${terminal} is not terminal`);
  }
});

test("no path that writes an order status restates the rule", () => {
  /* The drift this consolidation exists to prevent. A file that writes a status
     and also holds its own list of statuses is keeping a second copy of the
     machine. */
  const WRITERS = [
    "lib/services/orders.ts",
    "lib/services/admin/manage.ts",
  ];

  for (const rel of WRITERS) {
    const src = readFileSync(join(ROOT, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1 ");

    /* An array literal of two or more order statuses is a transition rule
       written out by hand. */
    const listed = [...src.matchAll(/\[\s*("(?:pending_payment|confirmed|packed|out_for_delivery|delivered|cancelled|refund_initiated|refunded)"\s*,\s*)+"[a-z_]+"\s*\]/g)];
    assert.deepEqual(
      listed.map((m) => m[0]),
      [],
      `${rel} lists order statuses inline instead of using lib/order-flow.ts`
    );
    assert.match(
      src,
      /@\/lib\/order-flow/,
      `${rel} writes an order status without importing the state machine`
    );
  }
});

test("refunding is unreachable, and that is recorded where the rule lives", () => {
  /* Nothing leads to refund_initiated — delivered and cancelled are both
     terminal — so refunded cannot be reached either. That matches the system:
     no refund entity, no workflow (ISS-025). Adding an edge would make the
     machine claim a capability the application does not have, and the refund
     policy is the owner's to set. This pins the gap so it is found on purpose
     rather than discovered by a customer who is owed money. */
  const reachesRefund = ALL.some((from) => nextOrderStatuses(from).includes("refund_initiated"));
  assert.equal(
    reachesRefund,
    false,
    "refund_initiated is now reachable — the refund workflow (ISS-025) must exist before the edge does"
  );
});
