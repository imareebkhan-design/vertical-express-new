import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The console is navigable below desktop width, and Drivers & vehicles is one
 * click from the Operations group on every screen size (owner, 14 Oct).
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("the admin header renders the mobile menu, and the menu uses the sidebar's destinations", () => {
  assert.match(read("app/admin/layout.tsx"), /<AdminMobileNav \/>/);
  const nav = read("components/admin/mobile-nav.tsx");
  assert.match(nav, /import \{ GROUPS \} from "@\/components\/admin\/sidebar"/);
  assert.match(nav, /lg:hidden/);
});

test("Drivers & vehicles sits in Operations, right after Dispatch, and has a page", () => {
  const s = read("components/admin/sidebar.tsx");
  const ops = s.slice(s.indexOf('heading: "Operations"'), s.indexOf('heading: "Catalog & stock"'));
  assert.ok(ops.indexOf('"/admin/drivers"') > ops.indexOf('"/admin/dispatch"'));
  assert.match(read("app/admin/drivers/page.tsx"), /getAdminUser\(\)/);
});

test("the generic dispatch action cannot mark a shipment delivered; the exception action needs a reason", () => {
  const a = read("actions/dispatch.ts");
  assert.match(a, /to: z\.enum\(\["packed", "out_for_delivery", "cancelled"\]\)/);
  assert.match(a, /export async function adminDeliverWithoutCode[\s\S]*getAdminUser\(\)[\s\S]*overrideReason: parsed\.data\.reason/);
});

test("the dispatch board never shows the delivery code to read to a driver", () => {
  const c = read("components/admin/dispatch-controls.tsx").replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.doesNotMatch(c, /Read this to the driver/);
  assert.doesNotMatch(c, /\{code\}/, "the code digits are rendered on the board");
  assert.match(c, /Never give it to the driver/);
});
