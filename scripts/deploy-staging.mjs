import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function assertStagingSource({ branch, head, remoteHead, status }) {
  if (branch !== "release/rc-2026-10-19") throw new Error("Staging requires the integrated release/rc-2026-10-19 branch");
  if (status.trim()) throw new Error("Staging requires a clean checkout");
  if (!head || head !== remoteHead) throw new Error("Staging requires the current origin release head");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("fetch", "origin", "release/rc-2026-10-19");
  assertStagingSource({
    branch: git("branch", "--show-current"), head: git("rev-parse", "HEAD"),
    remoteHead: git("rev-parse", "FETCH_HEAD"), status: git("status", "--porcelain"),
  });
  execFileSync("firebase", ["deploy", "--only", "apphosting:ve-staging", "--project", "vertical-express", "--non-interactive"], { cwd, stdio: "inherit" });
}
