import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every operations destination leads somewhere.
 *
 * The console is a tool people use all day, and a dispatcher who clicks Returns
 * mid-shift and gets an error page stops trusting the whole thing. Ten of the
 * canvas's nineteen destinations had no route at all — a third of the console
 * the design specifies, missing, with nothing saying so.
 *
 * A screen that is designed but not built is fine and says as much. A link to
 * nothing is not.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SIDEBAR = readFileSync(join(ROOT, "components/admin/sidebar.tsx"), "utf8");

/** Every href the sidebar offers. */
const hrefs = [...SIDEBAR.matchAll(/href:\s*"(\/admin[^"]*)"/g)].map((m) => m[1]);

test("the sidebar offers the canvas's full destination set", () => {
  /* Nineteen entries across five groups. If this drops, a group has been lost
     rather than a link edited. */
  assert.ok(hrefs.length >= 19, `expected at least 19 destinations, found ${hrefs.length}`);
  for (const group of ["Operations", "Catalog & stock", "Customers", "Money", "Configure"]) {
    assert.ok(SIDEBAR.includes(`heading: "${group}"`), `the ${group} group is missing`);
  }
});

test("every destination resolves to a real page", () => {
  const missing = hrefs.filter((href) => {
    const dir = href === "/admin" ? "app/admin" : `app${href}`;
    return !existsSync(join(ROOT, dir, "page.tsx"));
  });
  assert.deepEqual(
    missing,
    [],
    "These sidebar links 404. Build the screen — OpsNotBuilt is the honest " +
      "placeholder — or remove the link.\n  - " + missing.join("\n  - ")
  );
});

test("a screen with no model behind it says so", () => {
  /* The failure this prevents is subtler than a 404: a screen that renders an
     empty table reads as "no returns today" rather than "returns are not
     recorded", and somebody makes a decision on it.
   *
   * Asserted on the intent rather than on one component. These screens started
   * as an OpsNotBuilt card and became full artboard layouts with honest empty
   * states — the wording changed, the obligation did not. What matters is that
   * each names the thing that is missing.
   */
  const UNBACKED = [
    "app/admin/returns/page.tsx",
    "app/admin/stock-ledger/page.tsx",
    "app/admin/suppliers/page.tsx",
    "app/admin/support/page.tsx",
  ];

  for (const rel of UNBACKED) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const declares =
      src.includes("OpsNotBuilt") ||
      /does not exist|no .*model|nothing records|because nothing/i.test(src);
    assert.ok(
      declares,
      `${rel} renders a screen with no data behind it and never says so. ` +
        `An empty table reads as "nothing happened today".`
    );
  }
});
