import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsTable, OpsFilters, OpsStats } from "@/components/admin/ops-table";
import { getAdminUser } from "@/lib/services/admin/authz";

export const metadata: Metadata = {
  title: "Credit ledger | Operations",
  robots: { index: false },
};

export default async function Page() {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  return (
    <OpsScreen title="Credit ledger" intro="Trade credit extended, used and repaid.">
      <div className="flex flex-col gap-4">
        <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-3 text-[12px] font-semibold leading-[17px] text-ops-warn">
          Vertical Credit does not exist as a product. There is no credit model, no limit, no ageing and no terms, and it is on the do-not-build list until the commercial policy is confirmed. This screen shows what the console would need on the day it is — and what the customer-facing wallet screen is already describing.
        </p>

        <OpsStats
          stats={[
            { label: "Credit extended", note: "No limits are set. A limit is a commercial decision, not a default." },
            { label: "Outstanding", note: "Nothing is drawn, because nothing can be." },
            { label: "Overdue 60+", note: "Ageing needs terms. No repayment window has been agreed." },
            { label: "Average days to pay", note: "Meaningless until there is something to pay against." },
          ]}
        />

        <OpsFilters filters={["All", "Within terms", "Overdue", "Suspended"]} active="All" disabled />

        <OpsTable
          columns={["Customer", "Type", "Limit", "Used", "Available", "Oldest unpaid", "Status"]}
          rows={[]}
          emptyTitle="No credit accounts."
          emptyNote="Trade credit is how a contractor buys in season and pays after the pour. It is also how a supplier goes under. The terms, the limit and the recovery process are one decision, and it is the owner's."
        />
      </div>
    </OpsScreen>
  );
}
