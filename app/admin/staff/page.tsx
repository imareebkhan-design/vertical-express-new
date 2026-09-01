import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsTable, OpsFilters, OpsStats } from "@/components/admin/ops-table";

export const metadata: Metadata = {
  title: "Staff & roles | Operations",
  robots: { index: false },
};

export default function Page() {
  return (
    <OpsScreen title="Staff & roles" intro="Who can see and change what.">
      <div className="flex flex-col gap-4">
        <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-3 text-[12px] font-semibold leading-[17px] text-ops-warn">
          The schema has four roles — customer, admin, vendor and professional. There is no dispatcher, warehouse, accounts or support role, so everyone working in this console today needs admin: a warehouse hand loading a truck has the same access as the owner, including margins and prices.
        </p>

        <OpsStats
          stats={[
            { label: "People with access", note: "Governed by the ADMIN_EMAILS allowlist, which is all-or-nothing." },
            { label: "Roles in the schema", note: "Four, none of which describes a job anyone here does." },
            { label: "Scoped permissions", note: "None. Access is a single boolean: admin, or not." },
            { label: "Last access review", note: "Never — nothing records who looked at what." },
          ]}
        />

        <OpsFilters filters={["All", "Active", "Invited", "Suspended"]} active="All" disabled />

        <OpsTable
          columns={["Name", "Phone", "Role", "Status", "Last active"]}
          rows={[]}
          emptyTitle="Staff are not managed here yet."
          emptyNote="Access is an environment variable — a comma-separated list of email addresses. Adding somebody means a deploy, removing them means a deploy, and in between everyone has everything. A picker should never see a margin."
        />
      </div>
    </OpsScreen>
  );
}
