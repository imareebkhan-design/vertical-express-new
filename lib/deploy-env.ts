/**
 * Which kind of deployment this process is, and whether the public catalogue
 * must apply its production-only rules (ISS-093).
 *
 * `PAYMENT_GATEWAY` alone used to answer this ("is money live?"), so a
 * production backend misconfigured as staging, or missing the setting, would
 * have shown photos whose reuse rights were never attested. `VE_DEPLOY_ENV`
 * now declares the environment explicitly, and every doubtful combination
 * fails CLOSED: strict unless this is plainly local development or a staging
 * backend whose payment setup is consistently test-only.
 *
 * Pure and dependency-free: the catalogue policy, the tests and the reasoning
 * all read the same function.
 */

export type Env = Record<string, string | undefined>;

export const DEPLOY_ENVS = ["production", "staging", "development"] as const;
export type DeployEnv = (typeof DEPLOY_ENVS)[number];

/** A staging backend's payment setup, as `activeGateway()` permits it: test keys, explicit opt-in. */
function consistentStagingPayments(env: Env): boolean {
  return (
    env.PAYMENT_GATEWAY === "razorpay-test" &&
    env.ALLOW_TEST_GATEWAY === "1" &&
    (env.RAZORPAY_KEY_ID ?? "").startsWith("rzp_test_")
  );
}

/**
 * Whether the public catalogue must apply production rules: only photos with an
 * attested licence, and never the QA fixture.
 *
 *   live money (`PAYMENT_GATEWAY=razorpay-live`)        → strict, whatever else says
 *   `VE_DEPLOY_ENV=production`                           → strict
 *   `VE_DEPLOY_ENV=staging` + consistent test payments   → relaxed
 *   `VE_DEPLOY_ENV=staging` + anything else              → strict (contradictory)
 *   `VE_DEPLOY_ENV=development` outside NODE_ENV=production → relaxed
 *   unset/unknown on a NODE_ENV=production server        → strict (undeclared deploy)
 *   unset in local development and tests                 → relaxed
 */
export function strictCatalogue(env: Env = process.env): boolean {
  if (env.PAYMENT_GATEWAY === "razorpay-live") return true;
  const declared = env.VE_DEPLOY_ENV;
  const productionBuild = env.NODE_ENV === "production";
  switch (declared) {
    case "production":
      return true;
    case "staging":
      return !consistentStagingPayments(env);
    case "development":
      return productionBuild;
    case undefined:
    case "":
      return productionBuild;
    default:
      return true; // a value nobody defined is not permission to relax
  }
}

/** Why this process's environment declaration is missing or inconsistent, for preflight; null when it is fine. */
export function deployEnvProblem(env: Env = process.env): string | null {
  const declared = env.VE_DEPLOY_ENV;
  if (!declared) return "VE_DEPLOY_ENV is not set; a deployed backend then applies production catalogue rules";
  if (!(DEPLOY_ENVS as readonly string[]).includes(declared)) return `VE_DEPLOY_ENV="${declared}" is not one of ${DEPLOY_ENVS.join(", ")}`;
  if (declared === "production" && env.PAYMENT_GATEWAY !== "razorpay-live") return "VE_DEPLOY_ENV=production but PAYMENT_GATEWAY is not razorpay-live";
  if (declared === "staging" && !consistentStagingPayments(env)) return "VE_DEPLOY_ENV=staging but payments are not a consistent test setup (razorpay-test, ALLOW_TEST_GATEWAY=1, rzp_test_ key)";
  if (declared === "development" && env.NODE_ENV === "production") return "VE_DEPLOY_ENV=development on a NODE_ENV=production server";
  return null;
}
