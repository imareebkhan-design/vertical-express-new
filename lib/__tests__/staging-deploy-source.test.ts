import test from "node:test";
import assert from "node:assert/strict";
import { assertStagingSource } from "../../scripts/deploy-staging.mjs";

test("staging deploy accepts only the clean current release head", () => {
  const source = { branch: "release/rc-2026-10-19", head: "abc", remoteHead: "abc", status: "" };
  assert.doesNotThrow(() => assertStagingSource(source));
  assert.throws(() => assertStagingSource({ ...source, branch: "codex/old-feature" }), /integrated release/);
  assert.throws(() => assertStagingSource({ ...source, status: " M actions/brands.ts" }), /clean checkout/);
  assert.throws(() => assertStagingSource({ ...source, head: "old" }), /current origin/);
  assert.throws(() => assertStagingSource({ ...source, branch: "" }), /integrated release/);
});
