import type { Metadata } from "next";
import { OpsScreen, OpsNotBuilt } from "@/components/admin/ops-screen";

export const metadata: Metadata = {
  title: "Support | Operations",
  robots: { index: false },
};

export default function Page() {
  return (
    <OpsScreen title="Support" intro="Customer problems, in one queue.">
      <OpsNotBuilt
        does="A ticket queue tied to orders, so a complaint about a delivery opens with the delivery already attached."
        needs={[
          "A Ticket model",
          "A channel to receive from — WhatsApp is a wa.me link today, which is not a queue",
        ]}
      />
    </OpsScreen>
  );
}
