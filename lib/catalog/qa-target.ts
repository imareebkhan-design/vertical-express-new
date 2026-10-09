import { supabaseRef } from "../../scripts/prisma-db-guard.mjs";

/** Staging project ref — the only database the QA fixture script may touch. */
export const STAGING_REF = "gjhxhmcsuhxcmrvtkggz";
const PRODUCTION_REF = "gsfslnxvwmrgulzqypdp";

/** Null when the QA fixture may run against `url`; otherwise why not. */
export function qaTargetRefusal(url: string, expectRef: string | undefined, env: Record<string, string | undefined>): string | null {
  if (expectRef !== STAGING_REF) return `--expect-ref must be the staging ref ${STAGING_REF}`;
  const ref = supabaseRef(url);
  if (ref === PRODUCTION_REF) return "Refusing the production database";
  if (ref !== expectRef) return `Connection resolves to ${ref ?? "a non-Supabase host"}, not ${expectRef}`;
  if (env.PAYMENT_GATEWAY === "razorpay-live") return "Refusing: live payment gateway configured";
  return null;
}
