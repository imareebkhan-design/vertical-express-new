import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsTable, OpsFilters } from "@/components/admin/ops-table";

export const metadata: Metadata = {
  title: "Stock ledger | Operations",
  robots: { index: false },
};

/**
 * Stock ledger — artboard 12.
 *
 * The artboard states the problem better than a comment could: the schema keeps
 * one `Inventory.qtyOnHand` per variant per warehouse and no movement history,
 * so there is no way to answer "where did 34 bags go" or to reconcile a count
 * against anything.
 *
 * That is why this is the screen that unblocks arguments rather than the one
 * that looks impressive. A stock number nobody can explain gets overruled by
 * whoever counted last, and the count is usually wrong too.
 */
export default function AdminStockLedger() {
  return (
    <OpsScreen
      title="Stock ledger"
      intro="Every movement, with a reason and a person attached."
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-3 text-[12px] font-semibold leading-[17px] text-ops-warn">
          This ledger does not exist yet. Inventory stores one quantity per variant per
          warehouse with no history, so a stock figure cannot be explained — only asserted.
          Every screen in this console that changes stock has to write a row here before
          the number means anything.
        </p>

        <OpsFilters
          filters={["All movements", "Receipts", "Sales", "Adjustments", "Damage"]}
          active="All movements"
          disabled
        />

        <OpsTable
          columns={["When", "Type", "Product", "Batch", "Change", "On hand", "Reference"]}
          rows={[]}
          emptyTitle="No movements are recorded, because nothing records them."
          emptyNote="Stock is decremented correctly when an order is placed — race-free, in a transaction — but the decrement leaves no trace. A StockMovement model with a reason code on every row is what turns a disputed count into a readable history."
        />
      </div>
    </OpsScreen>
  );
}
