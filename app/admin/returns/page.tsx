import type { Metadata } from "next";
import { OpsScreen, OpsNotBuilt } from "@/components/admin/ops-screen";

export const metadata: Metadata = {
  title: "Returns & replacements | Operations",
  robots: { index: false },
};

export default function Page() {
  return (
    <OpsScreen title="Returns & replacements" intro="Damaged bags, wrong goods, and what we owe back.">
      <OpsNotBuilt
        does="Records what came back, why, and whether the customer is owed a replacement or a refund."
        needs={[
          "A Return model — nothing records a return today",
          "The return and refund policy, which is unconfirmed (CLAUDE.md)",
          "A link from the order so support can start one without retyping it",
        ]}
      />
    </OpsScreen>
  );
}
