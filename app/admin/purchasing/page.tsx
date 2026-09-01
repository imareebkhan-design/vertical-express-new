import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsTable, OpsFilters, OpsStats } from "@/components/admin/ops-table";

export const metadata: Metadata = {
  title: "Purchasing & goods receipt | Operations",
  robots: { index: false },
};

export default function Page() {
  return (
    <OpsScreen title="Purchasing & goods receipt" intro="What we have ordered from suppliers, and what physically arrived against it.">
      <div className="flex flex-col gap-4">
        <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-3 text-[12px] font-semibold leading-[17px] text-ops-warn">
          There is no PurchaseOrder model and no goods-receipt step. A purchase order is raised at a cost and a receipt reconciles against it — neither is possible while nothing records what a product cost or who supplied it (ISS-062).
        </p>

        <OpsStats
          stats={[
            { label: "Open POs", note: "Nothing to commit against — no purchase orders exist." },
            { label: "Due this week", note: "No delivery dates, because no order carries one." },
            { label: "Received today", note: "No goods receipts. Stock arrives and is adjusted by hand." },
            { label: "Blocked lines", note: "A line blocked on a batch cannot post to stock. There is no Batch model." },
          ]}
        />

        <OpsFilters filters={["All", "Open", "Partly received", "Closed"]} active="All" disabled />

        <OpsTable
          columns={["PO", "Supplier", "Ordered", "Expected", "Received", "Value", "Status"]}
          rows={[]}
          emptyTitle="No purchase orders."
          emptyNote="Until a purchase order exists, the difference between what was ordered and what turned up lives in somebody's memory. That difference is where a supplier dispute starts."
        />
      </div>
    </OpsScreen>
  );
}
