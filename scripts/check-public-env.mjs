/**
 * Build guard: refuse to build without the public Firebase web config.
 *
 * `NEXT_PUBLIC_*` values are inlined into the client bundle when `next build`
 * runs. Build without them and the build succeeds — and then every page,
 * public content included, renders the generic error boundary, because the
 * header's account button starts Firebase Auth and `firebaseApp()` throws
 * "Firebase web config is missing" (lib/firebase/client.ts). Nothing reports a
 * failure until somebody opens the site. Caught here, it is a failed build
 * that names what is missing.
 *
 * The six names are the ones `npm run preflight` already treats as required
 * for sign-in (its "Nobody can sign in" tier, ISS-053) and the ones
 * apphosting.yaml makes available at BUILD. Keep the three lists in step.
 *
 * Runs as `prebuild`, so it fires for `npm run build` — which is what Firebase
 * App Hosting runs. It does not run for `next dev`.
 *
 * .env files are loaded exactly as `next build` loads them (@next/env), so a
 * value in .env.local counts here precisely when it would count for Next.
 *
 * Never prints a value. Only variable names reach the output.
 */

import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PUBLIC_FIREBASE_VARS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

/** The names that are unset or blank. A whitespace-only value is unset. */
export function missingPublicFirebaseVars(env) {
  return PUBLIC_FIREBASE_VARS.filter((name) => !(env[name] ?? "").trim());
}

function main() {
  const require = createRequire(import.meta.url);
  const { loadEnvConfig } = require("@next/env");
  const root = fileURLToPath(new URL("../", import.meta.url));
  /* dev = false: the production file set, as `next build` uses. Silent, so
     @next/env's own "Loaded env from …" lines stay out of build logs. */
  loadEnvConfig(root, false, { info: () => {}, error: () => {} });

  const missing = missingPublicFirebaseVars(process.env);
  if (missing.length === 0) return;

  process.stderr.write(
    "\n=== Build guard: public Firebase config is missing ===\n\n" +
      missing.map((n) => "  " + n).join("\n") +
      "\n\n" +
      "  These are inlined into the browser bundle at build time. A build\n" +
      "  without them succeeds and then every page renders the error screen,\n" +
      "  because sign-in cannot start.\n\n" +
      "  Set them in the build environment (apphosting.yaml, availability BUILD)\n" +
      "  or in .env.local for a local build. They are public web config, not\n" +
      "  secrets — see lib/firebase/client.ts.\n\n"
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
