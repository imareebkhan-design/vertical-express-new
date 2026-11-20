import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertStagingSource, deployStaging } from "../../scripts/deploy-staging.mjs";

test("staging deploy accepts only the clean current release head", () => {
  const source = { branch: "release/rc-2026-10-19", head: "abc", remoteHead: "abc", status: "" };
  assert.doesNotThrow(() => assertStagingSource(source));
  assert.throws(() => assertStagingSource({ ...source, branch: "codex/old-feature" }), /integrated release/);
  assert.throws(() => assertStagingSource({ ...source, status: " M actions/brands.ts" }), /clean checkout/);
  assert.throws(() => assertStagingSource({ ...source, head: "old" }), /current canonical/);
  assert.throws(() => assertStagingSource({ ...source, branch: "" }), /integrated release/);
});

test("deployment entry point uploads only the canonical committed snapshot", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "ve-deploy-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "-b", "release/rc-2026-10-19");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  writeFileSync(join(cwd, "app.txt"), "committed");
  git("add", "app.txt");
  git("commit", "-m", "fixture");
  const head = git("rev-parse", "HEAD");
  writeFileSync(join(cwd, ".git/info/exclude"), "injected.txt\n");
  writeFileSync(join(cwd, "injected.txt"), "must not upload");
  let deployed = false;
  let snapshot = "";
  const run: typeof execFileSync = ((command: string, args: string[], options: { cwd?: string }) => {
    if (command === "git" && args[0] === "fetch") {
      assert.deepEqual(args, ["fetch", "https://github.com/imareebkhan-design/vertical-express-new.git", "release/rc-2026-10-19"]);
      return "";
    }
    if (command === "git" && args[1] === "FETCH_HEAD") return head;
    if (command === "git" && args[0] === "archive") writeFileSync(join(cwd, "app.txt"), "changed after check");
    if (command === "npx") {
      assert.deepEqual(args, ["--yes", "firebase-tools@15.35.0", "deploy", "--only", "apphosting:ve-staging", "--project", "vertical-express", "--non-interactive"]);
      snapshot = options.cwd!;
      assert.equal(readFileSync(join(snapshot, "app.txt"), "utf8"), "committed");
      assert.equal(existsSync(join(snapshot, "injected.txt")), false);
      deployed = true;
      throw new Error("simulated deploy failure");
    }
    return execFileSync(command, args, options);
  }) as typeof execFileSync;
  assert.throws(() => deployStaging({ cwd, run }), /simulated deploy failure/);
  assert.equal(deployed, true);
  assert.equal(existsSync(snapshot), false);
  deployed = false;
  assert.throws(() => deployStaging({ cwd, run }), /clean checkout/);
  assert.equal(deployed, false);
});
