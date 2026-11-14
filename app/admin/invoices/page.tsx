import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsTable, OpsFilters, OpsStats } from "@/components/admin/ops-table";
import { getAdminUser } from "@/lib/services/admin/authz";

export const metadata: Metadata = {
  title: "Invoices | Operations",
  robots: { index: false },
};

export default async function Page() {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  return (
    <OpsScreen title="Invoices" intro="Tax invoices issued against orders.">
      <div className="flex flex-col gap-4">
        <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-3 text-[12px] font-semibold leading-[17px] text-ops-warn">
          There is no Invoice model — only Payment. What is missing is statutory rather than cosmetic: a sequential number series per financial year, supplier and recipient GSTIN, HSN per line, place of supply, and a separate credit-note series. Place of supply is Jammu & Kashmir for all of these, so it is always CGST plus SGST and never IGST.
        </p>

        <OpsStats
          stats={[
            { label: "Invoiced this month", note: "No invoices are issued. Orders carry tax figures; nothing turns them into a document." },
            { label: "Tax collected", note: "Computed per order and correct — but not attributable to an invoice number." },
            { label: "B2B invoices", note: "Order has no gstin field, so a business customer's number cannot reach a document." },
            { label: "Credit notes", note: "No credit-note series. A refund currently leaves no tax document at all." },
          ]}
        />

        <OpsFilters filters={["All", "B2B", "B2C", "Credit notes"]} active="All" disabled />

        <OpsTable
          columns={["Invoice", "Date", "Order", "Customer", "Taxable", "CGST", "SGST", "Total"]}
          rows={[]}
          emptyTitle="No invoices are issued."
          emptyNote="The GST arithmetic is already correct on every order — rates are owner-confirmed and tax is extracted from a GST-inclusive price. What is absent is the document: a number series that never repeats or skips, which is the part a filing depends on."
        />
      </div>
    </OpsScreen>
  );
}
