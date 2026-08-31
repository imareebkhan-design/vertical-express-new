import type { Metadata } from "next";
import { OpsScreen, OpsNotBuilt } from "@/components/admin/ops-screen";

export const metadata: Metadata = {
  title: "COD cash | Operations",
  robots: { index: false },
};

export default function Page() {
  return (
    <OpsScreen title="COD cash" intro="Cash collected by drivers, and whether it has been banked.">
      <OpsNotBuilt
        does="Reconciles what each driver was owed against what they handed in, per run and per day."
        needs={[
          "A Driver model to attribute collections to",
          "A cash-handover record; nothing tracks money between the gate and the bank",
          "The COD ceiling, which is unset — see the FAQ and checkout",
        ]}
      />
    </OpsScreen>
  );
}
