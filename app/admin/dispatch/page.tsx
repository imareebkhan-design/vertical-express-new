import type { Metadata } from "next";
import { OpsScreen, OpsNotBuilt } from "@/components/admin/ops-screen";

export const metadata: Metadata = {
  title: "Dispatch | Operations",
  robots: { index: false },
};

export default function Page() {
  return (
    <OpsScreen title="Dispatch" intro="Which shipments are loaded, on which vehicle, and who is driving.">
      <OpsNotBuilt
        does="Shows every shipment waiting to leave, grouped by vehicle and slot, so a dispatcher can load a truck once rather than three times."
        needs={[
          "A Driver model — there is none, so a shipment cannot be assigned to anybody",
          "Vehicle records, and which shipments are on which run",
          "Delivery slots (ISS-057) — without them there is no order to dispatch in",
        ]}
      />
    </OpsScreen>
  );
}
