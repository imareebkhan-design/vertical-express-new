/**
 * Build guard: refuse to build while a dev server is using the same `.next`.
 *
 * `next build` and `next dev` write to the same directory. Running a build
 * while a dev server is up replaces files the dev server has open, and the dev
 * server then starts returning 500 on every page with
 *
 *   ENOENT: .next/static/development/_buildManifest.js.tmp.<random>
 *
 * The build itself succeeds, which is what makes it confusing: nothing reports
 * a failure, but the site you had open is broken until you delete `.next` and
 * restart. The only repair is exactly that, and it is not obvious from the
 * error, which names a temp file that never existed.
 *
 * This runs as `prebuild`, so it fires for `npm run build`. It deliberately
 * does NOT fire on Vercel: `vercel-build` calls `next build` directly rather
 * than going through `npm run build`, so this cannot interfere with a deploy.
 *
 * Detection is the dev server's own marker file. A port check would be wrong
 * in both directions — a dev server on another port still shares `.next`, and
 * something unrelated on 3000 does not.
 */

import { existsSync, readdirSync } from "node:fs";

const DEV_DIR = new URL("../.next/static/development/", import.meta.url);

function looksLikeRunningDevServer() {
  if (!existsSync(DEV_DIR)) return false;
  try {
    /* `next dev` maintains _buildManifest.js and _ssgManifest.js here. A
       finished build leaves no `static/development` directory at all. */
    return readdirSync(DEV_DIR).some((f) => f.startsWith("_buildManifest"));
  } catch {
    return false;
  }
}

if (process.env.VE_ALLOW_CONCURRENT_BUILD === "1") {
  process.exit(0);
}

if (looksLikeRunningDevServer()) {
  process.stderr.write(
    "\n=== Build guard: refusing to build ===\n\n" +
      "  A dev server appears to be using .next — `next build` writes to the\n" +
      "  same directory and will break it mid-request. The dev server starts\n" +
      "  returning 500 on every page and the build still reports success, so\n" +
      "  nothing tells you what happened.\n\n" +
      "  Stop the dev server first, then build.\n\n" +
      "  If .next is stale from a dev server that is already gone:\n\n" +
      "      rm -rf .next && npm run build\n\n" +
      "  To override deliberately:\n\n" +
      "      VE_ALLOW_CONCURRENT_BUILD=1 npm run build\n\n"
  );
  process.exit(1);
}
