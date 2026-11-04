import test from "node:test";
import assert from "node:assert/strict";
import { backAction, nextDepth, safeFallback } from "@/lib/back-stack";

/* Issue #26: the in-app Back arrow must agree with the phone's back button,
   and must never be a dead tap on a page opened from a shared link. */

test("with in-app history, Back pops history (never pushes a new entry)", () => {
  assert.deepEqual(backAction(1, "/categories"), { kind: "history" });
  assert.deepEqual(backAction(4, "/category/cement"), { kind: "history" });
});

test("entered directly (deep link, cold start), Back replaces with the logical parent", () => {
  assert.deepEqual(backAction(0, "/category/tiling"), { kind: "replace", href: "/category/tiling" });
});

test("the journey Home → Categories → Tiling → Product unwinds exactly", () => {
  let d = 0; // Home, the entry page
  d = nextDepth(d, false); // → Categories
  d = nextDepth(d, false); // → Tiling
  d = nextDepth(d, false); // → Product
  assert.equal(d, 3);
  d = nextDepth(d, true); // Back → Tiling
  d = nextDepth(d, true); // Back → Categories
  d = nextDepth(d, true); // Back → Home
  assert.equal(d, 0);
  assert.equal(backAction(d, "/categories").kind, "replace", "at the entry page Back must not leave the site");
});

test("depth never goes negative, so a stray popstate cannot strand the user", () => {
  assert.equal(nextDepth(0, true), 0);
});

test("the fallback is always a same-site path", () => {
  assert.equal(safeFallback("/category/cement"), "/category/cement");
  for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/a b", "/\\evil"]) {
    assert.equal(safeFallback(bad), "/", bad);
  }
});
