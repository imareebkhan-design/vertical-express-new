import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsTable, OpsFilters } from "@/components/admin/ops-table";

export const metadata: Metadata = {
  title: "Suppliers | Operations",
  robots: { index: false },
};

/**
 * Suppliers — artboard 14.
 *
 * The other half of the catalogue. A `Brand` says what is in the bag; a
 * supplier says who sold it to us, at what cost, and how long they take. The
 * schema has the first and none of the second, which is why stock cannot be
 * valued and margin cannot be computed (ISS-062).
 */
export default function AdminSuppliers() {
  return (
    <OpsScreen
      title="Suppliers"
      intro="Who we buy from, on what terms, and whether they turn up when they said."
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-3 text-[12px] font-semibold leading-[17px] text-ops-warn">
          There is no Supplier model. Brand records what a product is; nothing records who
          sold it to us, at what landed cost, or how long they take to deliver — so
          purchasing cannot be raised and stock cannot be valued (ISS-062).
        </p>

        <OpsFilters filters={["All", "Active", "Late", "Onboarding"]} active="All" disabled />

        <OpsTable
          columns={["Supplier", "Category", "Location", "Contact", "GSTIN", "Lead time", "On-time", "Outstanding", "Status\","]}
          rows={[]}
          emptyTitle="No suppliers are recorded."
          emptyNote="Lead time and on-time percentage are the two columns that earn this screen: in a season where cement arrives late, knowing which supplier is reliably late is what stops a site standing idle."
        />
      </div>
    </OpsScreen>
  );
}
