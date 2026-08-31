import type { Metadata } from "next";
import { OpsScreen, OpsNotBuilt } from "@/components/admin/ops-screen";

export const metadata: Metadata = {
  title: "Purchasing & goods receipt | Operations",
  robots: { index: false },
};

export default function Page() {
  return (
    <OpsScreen title="Purchasing & goods receipt" intro="What we have ordered from suppliers, and what has landed.">
      <OpsNotBuilt
        does="Raises purchase orders, records what physically arrived against them, and puts the difference somewhere visible."
        needs={[
          "A PurchaseOrder model and a goods-receipt step",
          "Supplier records (below) to raise an order against",
        ]}
      />
    </OpsScreen>
  );
}
