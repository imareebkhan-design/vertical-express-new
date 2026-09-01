import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsTable, OpsFilters } from "@/components/admin/ops-table";

export const metadata: Metadata = {
  title: "Support | Operations",
  robots: { index: false },
};

/**
 * Support — artboard 17.
 *
 * A ticket queue tied to orders, so a complaint about a delivery opens with the
 * delivery already attached rather than with somebody asking for an order
 * number.
 *
 * The artboard's four figures — open tickets, median first response, escalated,
 * resolved this week — are all measures of a queue that does not exist. There
 * is no Ticket model and no channel to receive from: WhatsApp is a wa.me link,
 * which is a way to start a conversation and not a way to keep one.
 */
export default function AdminSupport() {
  return (
    <OpsScreen title="Support" intro="Customer problems, in one queue, attached to the order they are about.">
      <div className="flex flex-col gap-4">
        <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-3 text-[12px] font-semibold leading-[17px] text-ops-warn">
          There is no Ticket model, and no channel that produces one. The WhatsApp link on
          the storefront starts a conversation in somebody&rsquo;s personal inbox — it does
          not create anything this console can see, assign or measure.
        </p>

        <OpsFilters
          filters={["Open", "Waiting on us", "Waiting on customer", "Resolved"]}
          active="Open"
          disabled
        />

        <OpsTable
          columns={["Ticket", "Customer", "Subject", "Status", "Owner"]}
          rows={[]}
          emptyTitle="No tickets, because nothing raises one."
          emptyNote="First-response time is the figure this screen exists to protect. It cannot be measured until a complaint has a recorded arrival time, which needs the model."
        />
      </div>
    </OpsScreen>
  );
}
