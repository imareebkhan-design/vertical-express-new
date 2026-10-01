import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { signInPathFor } from "../auth/sign-in-path";
import { safeNextPath } from "../safe-next";

/**
 * The early sign-in redirect for dead sessions (lib/auth/early-sign-in.ts).
 *
 * A visitor whose session cookie is present but dead passed middleware and was
 * redirected by the page — under a loading.tsx, after the shell had streamed —
 * which the client router could only do as a hard navigation, logging React
 * error #310 on the way. The redirect now happens in the segment's layout,
 * above the loading boundary, as a plain 307.
 */

const APP = fileURLToPath(new URL("../../app/", import.meta.url));

test("the sign-in URL returns the visitor exactly where they were going", () => {
  for (const path of ["/account", "/account/orders?page=2", "/checkout", "/checkout/confirmation/VE-1"]) {
    const url = new URL(signInPathFor(path), "https://verticalexpress.in");
    assert.equal(url.pathname, "/login");
    assert.equal(url.searchParams.get("next"), path, `${path} did not survive the round trip`);
    assert.equal(safeNextPath(url.searchParams.get("next")), path, `sign-in would refuse ${path}`);
  }
});

test("the sign-in URL is encoded the way middleware encodes it", () => {
  /* Middleware builds its redirect with URLSearchParams. Two encodings of the
     same destination would be two URLs for one page. */
  assert.equal(signInPathFor("/account/orders"), "/login?next=%2Faccount%2Forders");
});

/** Every loading.tsx under app/, as [segment dir, route path]. */
function loadingSegments(dir = APP): [string, string][] {
  const out: [string, string][] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...loadingSegments(full));
    else if (entry.name === "loading.tsx") {
      const route =
        "/" +
        relative(APP, dirname(full))
          .split(sep)
          .filter((s) => s && !/^\(.*\)$/.test(s)) // route groups are not in the URL
          .join("/");
      out.push([dirname(full), route]);
    }
  }
  return out;
}

test("no signed-in-only loading boundary can stream before the session is checked", () => {
  /* The relationship that produced the bug spans files — a loading.tsx and
     whichever layout sits above it — so no single unit test observes it. */
  const guarded = loadingSegments().filter(([, route]) => /^\/(account|checkout)(\/|$)/.test(route));
  assert.ok(guarded.length > 0, "no protected loading.tsx found — this test would be vacuous");

  for (const [segment, route] of guarded) {
    let dir = segment;
    let gated = false;
    while (dir.startsWith(APP) && dir !== APP.replace(/\/$/, "")) {
      const layout = join(dir, "layout.tsx");
      if (existsSync(layout) && /redirectDeadSessionToSignIn\(/.test(readFileSync(layout, "utf8"))) {
        gated = true;
        break;
      }
      dir = dirname(dir);
    }
    assert.ok(
      gated,
      `${route} has a loading.tsx with no layout above it calling redirectDeadSessionToSignIn — ` +
        "a dead session there is redirected after the shell streams, which logs React error #310"
    );
  }
});
