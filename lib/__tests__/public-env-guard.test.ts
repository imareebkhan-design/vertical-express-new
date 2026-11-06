import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_FIREBASE_VARS,
  missingPublicFirebaseVars,
} from "../../scripts/check-public-env.mjs";

/**
 * The prebuild guard for the public Firebase web config.
 *
 * A build without these values succeeded and then rendered the error screen on
 * every page, because the header starts Firebase Auth and firebaseApp() throws.
 * The guard turns that into a failed build that names what is missing.
 */

const complete = Object.fromEntries(PUBLIC_FIREBASE_VARS.map((n) => [n, "set"]));

test("a complete config passes", () => {
  assert.deepEqual(missingPublicFirebaseVars(complete), []);
});

test("nothing set names every variable", () => {
  assert.deepEqual(missingPublicFirebaseVars({}), PUBLIC_FIREBASE_VARS);
});

test("a blank or whitespace value counts as missing", () => {
  const env = { ...complete, NEXT_PUBLIC_FIREBASE_API_KEY: "", NEXT_PUBLIC_FIREBASE_APP_ID: "  " };
  assert.deepEqual(missingPublicFirebaseVars(env), [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ]);
});

test("the guard checks the variables the browser client actually reads", () => {
  /* A misspelt name here would pass the guard and still ship a broken site. */
  const client = readFileSync(
    fileURLToPath(new URL("../firebase/client.ts", import.meta.url)),
    "utf8"
  );
  for (const name of PUBLIC_FIREBASE_VARS) {
    assert.ok(client.includes(`process.env.${name}`), `lib/firebase/client.ts never reads ${name}`);
  }
});
