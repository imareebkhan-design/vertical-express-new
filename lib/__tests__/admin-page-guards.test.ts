import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every admin page checks admin access itself (closure-loop security review).
 *
 * app/admin/layout.tsx gates the console, but a request that renders only a
 * page segment (a client navigation, or a crafted RSC request that says the
 * layout is already mounted) never runs the layout — and these pages read
 * customers' phones, addresses and orders. Server actions already re-check;
 * pages now do too, as their first statement.
 */
const ADMIN = fileURLToPath(new URL("../../app/admin/", import.meta.url));
const pages = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? pages(p) : n === "page.tsx" ? [p] : [];
  });

test("every admin page checks admin access before doing anything else", () => {
  const all = pages(ADMIN);
  assert.ok(all.length >= 27, `found ${all.length} admin pages`);
  const unguarded = all.filter((f) => {
    const src = readFileSync(f, "utf8");
    const body = src.slice(src.indexOf("export default"));
    const firstAwait = body.indexOf("await ");
    const guard = Math.min(...["await getAdminUser()", "await adminGate()"].map((g) => (body.indexOf(g) === -1 ? Infinity : body.indexOf(g))));
    return guard === Infinity || firstAwait < guard;
  });
  assert.deepEqual(unguarded.map((f) => f.slice(ADMIN.length)), [], "these admin pages read before checking admin access");
});
