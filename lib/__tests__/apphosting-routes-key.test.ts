import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The staging backend references the Routes API key as a server-only secret.
 * Without it `routesConfigured()` is false and live tracking never has a route
 * or ETA (O-QA-5, 14 Oct). Never a NEXT_PUBLIC_ value.
 */
const yaml = readFileSync(join(fileURLToPath(new URL("../../", import.meta.url)), "apphosting.yaml"), "utf8");

test("GOOGLE_ROUTES_API_KEY comes from the google-routes-api-key secret at runtime", () => {
  assert.match(yaml, /- variable: GOOGLE_ROUTES_API_KEY\n\s+secret: google-routes-api-key\n\s+availability:\n\s+- RUNTIME/);
  assert.doesNotMatch(yaml, /NEXT_PUBLIC_GOOGLE_ROUTES/);
});

test("the browser Maps key reaches the staging BUILD from a secret, never as a literal in the repo", () => {
  assert.match(
    yaml,
    /- variable: NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY\n\s+secret: google-maps-browser-key-staging\n\s+availability:\n\s+- BUILD\n\s+- RUNTIME/
  );
  assert.doesNotMatch(yaml, /NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY\n\s+value:/, "no key value pasted into the repo");
});
