import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsTable, OpsFilters } from "@/components/admin/ops-table";
import { getAdminUser } from "@/lib/services/admin/authz";

export const metadata: Metadata = {
  title: "Returns & replacements | Operations",
  robots: { index: false },
};

/**
 * Returns & replacements — artboard 8.
 *
 * The artboard writes its own caveat into the screen, which is unusual and
 * worth keeping verbatim: the return window, the position on opened bags and
 * the refund timeline are all unconfirmed, and the queue "needs the owner's
 * sign-off before it can be enforced".
 *
 * That is the honest state twice over. There is also no Return model, so
 * nothing records a return today — a customer who tells a driver a bag arrived
 * split has that conversation and nothing else happens to it.
 */
export default async function AdminReturns() {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  return (
    <OpsScreen
      title="Returns & replacements"
      intro="What came back, why, and what we owe for it."
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-3 text-[12px] font-semibold leading-[17px] text-ops-warn">
          The return window, the position on opened bags, and the refund timeline are all
          unconfirmed. Nothing here can be enforced until those are settled — and a bag of
          cement opened on site is a different question from a sealed box of tiles, which
          is why one blanket window does not fit this catalogue.
        </p>

        <OpsFilters filters={["Open", "Approved", "Rejected", "Refunded"]} active="Open" disabled />

        <OpsTable
          columns={["Return", "Order & customer", "Item and reason", "Status", "Value"]}
          rows={[]}
          emptyTitle="No returns are recorded, because nothing records them."
          emptyNote="There is no Return model. When a customer tells a driver a bag arrived split, that conversation happens and leaves no trace here. This queue needs the model, and the policy above, before it can hold anything."
        />
      </div>
    </OpsScreen>
  );
}
