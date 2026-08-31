import type { Metadata } from "next";
import { OpsScreen, OpsNotBuilt } from "@/components/admin/ops-screen";

export const metadata: Metadata = {
  title: "Suppliers | Operations",
  robots: { index: false },
};

export default function Page() {
  return (
    <OpsScreen title="Suppliers" intro="Who we buy from, on what terms.">
      <OpsNotBuilt
        does="The other half of the catalogue — who supplies each product, at what cost, and how long they take."
        needs={[
          "A Supplier model — Product has a brand, which is not the same thing",
          "Cost prices, which the schema does not carry",
        ]}
      />
    </OpsScreen>
  );
}
