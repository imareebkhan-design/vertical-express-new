import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A screen must not say a capability is missing after it has been built.
 *
 * Eight files told an operator that drivers and vehicles did not exist. That
 * was true for the whole life of the project and stopped being true the moment
 * `20260905061559_drivers_vehicles` landed — at which point the honest panels
 * that had been the *right* thing to write became the wrong thing, all at once
 * and silently.
 *
 * This is the same failure the claims audit spent days on, pointing the other
 * way. A page that understates what the system can do is less dangerous than
 * one that overstates it, and it is still wrong: a dispatcher reading "there is
 * no driver roster" does not go looking for the roster that exists.
 *
 * The models are the source of truth. If `Driver` and `Vehicle` are in the
 * schema, nothing may claim they are not.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
const DRIVER_EXISTS = /^model Driver \{/m.test(schema);
const VEHICLE_EXISTS = /^model Vehicle \{/m.test(schema);
const SLOT_EXISTS = /^model (Slot|DeliverySlot) \{/m.test(schema);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const SOURCES = ["app", "components", "lib"].flatMap((d) =>
  walk(join(ROOT, d)).map((f) => relative(ROOT, f))
);

/** This file quotes the old copy to explain it, so it exempts itself. */
const SELF = "lib/__tests__/stale-capability-claims.test.ts";

test("the sweep is reading real files", () => {
  /* Non-vacuity: an empty file list passes everything below. */
  assert.ok(SOURCES.length > 200, `only ${SOURCES.length} source files found`);
  assert.ok(DRIVER_EXISTS, "the Driver model has gone — this test's premise is wrong");
});

test("nothing claims drivers or vehicles do not exist", () => {
  /* Phrasings actually used across the eight files, plus the obvious variants. */
  const CLAIMS: [RegExp, boolean][] = [
    [/no Driver model/i, DRIVER_EXISTS],
    [/there is no driver roster/i, DRIVER_EXISTS],
    [/no driver records exist/i, DRIVER_EXISTS],
    [/no driver or vehicle records exist/i, DRIVER_EXISTS],
    [/vehicles and drivers,? which do not exist/i, DRIVER_EXISTS && VEHICLE_EXISTS],
    [/no vehicles and no drivers/i, DRIVER_EXISTS && VEHICLE_EXISTS],
    [/vehicles and drivers do not exist/i, DRIVER_EXISTS && VEHICLE_EXISTS],
    [/drivers? (?:do|does) not exist/i, DRIVER_EXISTS],
    [/not assignable/i, DRIVER_EXISTS],
  ];

  for (const rel of SOURCES) {
    if (rel === SELF) continue;
    const src = readFileSync(join(ROOT, rel), "utf8");
    for (const [claim, nowFalse] of CLAIMS) {
      if (!nowFalse) continue;
      const m = claim.exec(src);
      assert.equal(
        m,
        null,
        `${rel} says "${m?.[0]}" — Driver and Vehicle are in the schema, so that ` +
          `is no longer true. A screen that understates what the system can do ` +
          `still sends an operator looking for something they already have.`
      );
    }
  }
});

test("claims about delivery slots are left alone, because slots really do not exist", () => {
  /* The counterpart, and the reason this test keys off the schema rather than a
     list of phrases to delete: three of the eight files named slots in the same
     breath as drivers, and only the drivers half had become false. Deleting
     both would have replaced an understatement with an overstatement. */
  assert.equal(SLOT_EXISTS, false, "a Slot model now exists — ISS-057 and these notes need revisiting");

  const dispatch = readFileSync(join(ROOT, "app/admin/dispatch/page.tsx"), "utf8");
  assert.match(
    dispatch,
    /ISS-057/,
    "the dispatch board no longer explains why there are two lanes rather than five"
  );
});

test("the dispatch board can actually reach the write path", () => {
  /* The claims above are only honest because the feature is wired. If the
     controls are removed and the copy is not, this fails rather than leaving a
     screen that promises assignment it cannot do. */
  const lane = readFileSync(join(ROOT, "components/admin/dispatch-lane.tsx"), "utf8");
  assert.match(lane, /DispatchControls/, "the dispatch board no longer renders its controls");

  const controls = readFileSync(
    join(ROOT, "components/admin/dispatch-controls.tsx"),
    "utf8"
  );
  assert.match(controls, /adminAssignShipment/, "the controls cannot assign a driver");
  assert.match(controls, /adminAdvanceShipment/, "the controls cannot move a shipment");
});

test("the handover code is shown once and never persisted to the screen", () => {
  /* It is a credential for a customer's gate. It is returned by the action so a
     dispatcher can read it to the driver, and is deliberately not stored, not
     re-fetchable and not in the audit trail. */
  const actions = readFileSync(join(ROOT, "actions/dispatch.ts"), "utf8");
  assert.match(actions, /deliveryCode/, "the dispatch action no longer returns the code");

  const controls = readFileSync(
    join(ROOT, "components/admin/dispatch-controls.tsx"),
    "utf8"
  );
  assert.ok(
    !/localStorage|sessionStorage/.test(controls),
    "the handover code is being persisted in the browser"
  );
});
