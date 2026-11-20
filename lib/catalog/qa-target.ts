import { supabaseRef } from "../../scripts/prisma-db-guard.mjs";

/** Staging project ref — the only shared database the QA fixture script may touch. */
export const STAGING_REF = "gjhxhmcsuhxcmrvtkggz";
const PRODUCTION_REF = "gsfslnxvwmrgulzqypdp";
/**
 * The script's rehearsal target: a disposable local database marked as such
 * (VE_TEST_DATABASE=1, the same marker the test suite's guard requires). Lets
 * an operator run the exact command against throwaway data before staging.
 */
export const LOCAL_TEST_REF = "local-test";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", ""]);

function isLocalHost(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Null when the QA fixture may run against `url`; otherwise why not. */
export function qaTargetRefusal(url: string, expectRef: string | undefined, env: Record<string, string | undefined>): string | null {
  if (env.PAYMENT_GATEWAY === "razorpay-live") return "Refusing: live payment gateway configured";
  const ref = supabaseRef(url);
  if (expectRef === LOCAL_TEST_REF) {
    if (ref !== null || !isLocalHost(url)) return `--expect-ref=${LOCAL_TEST_REF} only accepts a local database`;
    if (env.VE_TEST_DATABASE !== "1") return `--expect-ref=${LOCAL_TEST_REF} requires VE_TEST_DATABASE=1 (a disposable database)`;
    return null;
  }
  if (expectRef !== STAGING_REF) return `--expect-ref must be the staging ref ${STAGING_REF} (or ${LOCAL_TEST_REF} for a disposable local rehearsal)`;
  if (ref === PRODUCTION_REF) return "Refusing the production database";
  if (ref !== expectRef) return `Connection resolves to ${ref ?? "a non-Supabase host"}, not ${expectRef}`;
  return null;
}
