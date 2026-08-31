import type { Metadata } from "next";
import { OpsScreen, OpsNotBuilt } from "@/components/admin/ops-screen";

export const metadata: Metadata = {
  title: "Credit ledger | Operations",
  robots: { index: false },
};

export default function Page() {
  return (
    <OpsScreen title="Credit ledger" intro="Trade credit extended, used and repaid.">
      <OpsNotBuilt
        does="Tracks each account's limit, what is drawn, and what is due when."
        needs={[
          "Credit terms, which are on the do-not-build list until the owner sets them",
          "A CreditAccount model and a repayment record",
        ]}
      />
    </OpsScreen>
  );
}
