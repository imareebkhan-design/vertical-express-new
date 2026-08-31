import type { Metadata } from "next";
import { OpsScreen, OpsNotBuilt } from "@/components/admin/ops-screen";

export const metadata: Metadata = {
  title: "Stock ledger | Operations",
  robots: { index: false },
};

export default function Page() {
  return (
    <OpsScreen title="Stock ledger" intro="Every movement in and out, with a reason attached.">
      <OpsNotBuilt
        does="The audit trail behind Inventory — receipts, sales, damage, corrections — so a count that looks wrong can be explained rather than argued about."
        needs={[
          "A StockMovement model; Inventory currently stores a level, not a history",
          "A reason code on every adjustment, or the ledger explains nothing",
        ]}
      />
    </OpsScreen>
  );
}
