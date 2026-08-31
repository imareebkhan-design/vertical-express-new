import type { Metadata } from "next";
import { OpsScreen, OpsNotBuilt } from "@/components/admin/ops-screen";

export const metadata: Metadata = {
  title: "Invoices | Operations",
  robots: { index: false },
};

export default function Page() {
  return (
    <OpsScreen title="Invoices" intro="Tax invoices issued against orders.">
      <OpsNotBuilt
        does="Issues and stores the GST invoice for an order, and makes it retrievable later."
        needs={[
          "An Invoice model — the order carries tax figures, but no invoice is issued",
          "The company GSTIN (ISS-056), which is not set",
          "Order.gstin, so a business customer's number reaches the document",
        ]}
      />
    </OpsScreen>
  );
}
