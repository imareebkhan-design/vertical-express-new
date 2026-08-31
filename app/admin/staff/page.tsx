import type { Metadata } from "next";
import { OpsScreen, OpsNotBuilt } from "@/components/admin/ops-screen";

export const metadata: Metadata = {
  title: "Staff & roles | Operations",
  robots: { index: false },
};

export default function Page() {
  return (
    <OpsScreen title="Staff & roles" intro="Who can see and change what.">
      <OpsNotBuilt
        does="Grants console access by role, so a picker never sees a margin and a dispatcher cannot edit a price."
        needs={[
          "Roles beyond the ADMIN_EMAILS allowlist, which is all-or-nothing today",
          "A permission model the screens actually consult",
        ]}
      />
    </OpsScreen>
  );
}
