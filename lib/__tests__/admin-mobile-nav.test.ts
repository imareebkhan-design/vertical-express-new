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
