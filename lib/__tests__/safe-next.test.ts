import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../safe-next";

test("same-site paths pass through", () => {
  for (const p of ["/", "/account", "/checkout?step=2", "/product/opc-53#specs"]) assert.equal(safeNextPath(p), p);
});

test("anything that could leave the site falls back", () => {
  for (const p of ["//evil.com", "/\\evil.com", "/\\\\evil.com", "https://evil.com", "evil.com", "javascript:alert(1)", "/\u0000//evil.com", "/%0d%0a"]) {
    const out = safeNextPath(p);
    assert.ok(out === "/" || out === p && !/^\/[\\/]/.test(p) && /^\/[^\\/]/.test(p), `${JSON.stringify(p)} -> ${out}`);
  }
  assert.equal(safeNextPath("/\\evil.com"), "/");
  assert.equal(safeNextPath("//evil.com"), "/");
  assert.equal(safeNextPath(null), "/");
  assert.equal(safeNextPath(undefined, "/account"), "/account");
});

test("the backslash trick really does leave the site, which is why it is refused", () => {
  assert.equal(new URL("/\\evil.com", "https://verticalexpress.in").host, "evil.com");
});
