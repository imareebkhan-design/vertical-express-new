import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke: anonymous customer journeys against a DEPLOYED backend.
 *
 * Read-only by design. Nothing here signs in, submits an enquiry, adds to a cart
 * or writes anything, so it is safe to point at staging or production. It is not
 * part of `npm test` (which needs a local Postgres); run it with `npm run e2e`.
 *
 * E2E_BASE_URL picks the backend. The default is staging, never production.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://ve-staging--vertical-express.asia-southeast1.hosted.app",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  /* Design widths: the phone artboards are drawn at ~380px, desktop at 1440. */
  projects: [
    { name: "phone-380", use: { ...devices["Pixel 7"], viewport: { width: 380, height: 800 } } },
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
});
