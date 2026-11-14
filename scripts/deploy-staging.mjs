import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const RELEASE = "release/rc-2026-10-19";
const CANONICAL = "https://github.com/imareebkhan-design/vertical-express-new.git";

/** Refuse feature branches, local edits and commits absent from the canonical release. */
export function assertStagingSource({ branch, head, remoteHead, status }) {
  if (branch !== RELEASE) throw new Error(`Staging requires the integrated ${RELEASE} branch`);
  if (status.trim()) throw new Error("Staging requires a clean checkout");
  if (!head || head !== remoteHead) throw new Error("Staging requires the current canonical release head");
}

/** Deploy a snapshot of the checked commit, excluding ignored files and later worktree edits. */
export function deployStaging({ cwd = fileURLToPath(new URL("../", import.meta.url)), run = execFileSync } = {}) {
  const git = (...args) => run("git", args, { cwd, encoding: "utf8" }).trim();
  git("fetch", CANONICAL, RELEASE);
  const head = git("rev-parse", "HEAD");
  assertStagingSource({
    branch: git("branch", "--show-current"), head,
    remoteHead: git("rev-parse", "FETCH_HEAD"), status: git("status", "--porcelain"),
  });
  const temporary = mkdtempSync(join(tmpdir(), "ve-staging-release-"));
  try {
    const source = join(temporary, "source");
    mkdirSync(source);
    const archive = join(temporary, "release.tar");
    git("archive", "--format=tar", "--output", archive, head);
    run("tar", ["-xf", archive, "-C", source], { stdio: "inherit" });
    run("npx", ["--yes", "firebase-tools@15.35.0", "deploy", "--only", "apphosting:ve-staging", "--project", "vertical-express", "--non-interactive"], { cwd: source, stdio: "inherit" });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) deployStaging();
