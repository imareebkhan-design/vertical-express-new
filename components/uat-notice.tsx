import { consistentStagingPayments } from "@/lib/deploy-env";

/** Keep test transactions and draft policies visibly separate from commerce. */
export function UatNotice() {
  if (process.env.VE_DEPLOY_ENV !== "staging" || !consistentStagingPayments(process.env)) return null;
  return <aside aria-label="Client testing environment" className="border-b border-ink bg-brand px-4 py-3 text-sm text-ink">
    <strong>CLIENT TESTING — no real payments or deliveries.</strong>{" "}
    Inventory and delivery settings are test data. Do not enter real card details.
    <details className="mt-1">
      <summary>Draft returns policy for review</summary>
      <p>Proposed policy: no voluntary returns. DRAFT — pending owner/client approval.
        Remedies for defective, incorrect or non-conforming goods are not excluded.
        Cancellation and refund workflows remain available for testing.
        Delivery terms and legal/business contact details are pending.</p>
    </details>
  </aside>;
}
