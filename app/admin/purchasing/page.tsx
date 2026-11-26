import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsTable, OpsFilters, OpsStats } from "@/components/admin/ops-table";
import { getAdminUser } from "@/lib/services/admin/authz";

export const metadata: Metadata = {
  title: "Purchasing & goods receipt | Operations",
  robots: { index: false },
};

export default async function Page() {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
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

        {/*
          Goods receipt — the artboard's second panel, and the single most
          load-bearing screen in the whole console that does not exist.

          It is where a batch number, a packing date and a photograph enter the
          system, and everything the customer is later shown about genuineness
          is copied from here. A line without those three cannot be accepted
          into stock. Today stock is adjusted by hand and none of the three is
          captured at all, which means the genuineness promise has no source.
        */}
        <div className="rounded-panel bg-white p-4 shadow-card">
          <h2 className="text-[15px] font-bold tracking-tight">Goods receipt</h2>
          <p className="mt-1 max-w-[680px] text-[12px] font-medium leading-[17px] text-ink-700">
            Receiving a delivery against a purchase order, line by line: how many were
            ordered, how many turned up, the batch or lot, the packing date and a
            photograph. A line short by two is a supplier conversation; a line with no
            batch cannot post to stock at all.
          </p>
          <div className="mt-3 rounded-field bg-ops-warn-tint p-3.5">
            <p className="text-[12.5px] font-bold text-ops-warn">
              No receiving step exists. Stock is adjusted by hand.
            </p>
            <p className="mt-1 text-[12px] font-medium leading-[17px] text-ops-warn">
              This is the only point at which genuineness data would enter the system —
              batch, packing date, photograph — and everything a customer is later shown
              about a bag being fresh and being ours is copied from it. Nothing captures
              any of the three, so that claim currently has no source. Cement does go off,
              which is why this matters more here than it would in most catalogues.
            </p>
          </div>
        </div>
      </div>
    </OpsScreen>
  );
}
