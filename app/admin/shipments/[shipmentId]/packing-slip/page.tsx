import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPackingSlip } from "@/lib/services/shipments";
import { Logo } from "@/components/ui/logo";
import { PrintInvoiceButton } from "@/components/account/print-invoice-button";
import { hasCustomerPin, navigationUrlFor } from "@/lib/delivery-navigation";
import { getAdminUser } from "@/lib/services/admin/authz";

export const metadata: Metadata = {
  title: "Packing slip | Operations",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * The document that goes in the box.
 *
 * ISS-009 named a packing slip missing from August until this landed. It is not a
 * statutory document — it carries no GSTIN, no HSN and no place of supply, and it
 * does not pretend to: those belong on a tax invoice, which cannot be issued at
 * all until the business is GST-registered (ISS-026). This is a checklist of what
 * is in this load, which is a different and simpler job.
 *
 * **The delivery code is not on it, on purpose.** Printing the handover code and
 * putting it in the box hands the proof to whoever is holding the parcel. The
 * code reaches the dispatcher's screen once and is read to the driver.
 *
 * The business's registered name and address are also absent, because they are
 * still unconfirmed — the same reason they were removed from the order document
 * in 677d08a. Inventing them for a document that goes to a customer is how a
 * fabricated legal entity ends up on somebody's desk.
 */
export default async function PackingSlipPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const { shipmentId } = await params;
  const slip = await getPackingSlip(shipmentId);
  if (!slip) notFound();

  const addr = slip.address;
  /* The approved Delivery & POD artboard gives the driver a Navigate action.
     It goes to the customer's confirmed pin when there is one, and to the
     written address otherwise — see lib/delivery-navigation.ts. */
  const navigationUrl = navigationUrlFor(addr);
  const hasPin = hasCustomerPin(addr);

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-8 font-sans print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between print:hidden">
        <Link
          href="/admin/dispatch"
          className="text-[13px] font-bold text-ink-700 no-underline hover:text-ink"
        >
          ← Back to dispatch
        </Link>
        <PrintInvoiceButton className="flex items-center gap-2" />
      </div>

      <main className="mx-auto max-w-2xl rounded-card border border-hairline-border bg-white p-8 shadow-card print:border-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-neutral-200 pb-5">
          <div>
            <Logo variant="horizontal" className="h-9" />
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
              Packing slip
            </p>
          </div>
          <div className="text-right">
            <p className="text-[15px] font-extrabold tabular-nums text-ink">{slip.ref}</p>
            <p className="mt-0.5 text-[12px] font-semibold text-neutral-500">
              {slip.ofShipments > 1
                ? `Shipment ${slip.sequence} of ${slip.ofShipments}`
                : "One shipment"}
            </p>
            <p className="mt-0.5 text-[12px] font-semibold text-neutral-500">
              {slip.speedClass === "express" ? "Express" : "By truck"}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-neutral-500">
              Deliver to
            </p>
            {addr ? (
              <address className="mt-1.5 text-[13px] font-medium not-italic leading-[19px] text-ink">
                <span className="block font-bold">{addr.name}</span>
                {addr.line1}
                {addr.line2 ? <>, {addr.line2}</> : null}
                <br />
                {addr.landmark ? (
                  <>
                    {addr.landmark}
                    <br />
                  </>
                ) : null}
                {addr.city}, {addr.state} {addr.pincode}
                <br />
                <span className="tabular-nums">{addr.phone}</span>
              </address>
            ) : null}
            {addr?.accessNote ? (
              /* What the customer told us about reaching the gate. It is the
                 difference between a truck that can unload and one that turns
                 around, so it prints with the address rather than nowhere. */
              <p className="mt-2 text-[12px] font-medium leading-[17px] text-ink">
                <span className="font-bold">Access:</span> {addr.accessNote}
              </p>
            ) : null}
            {navigationUrl ? (
              <p className="mt-2 text-[11px] font-medium leading-[15px] text-neutral-600 print:hidden">
                <a href={navigationUrl} target="_blank" rel="noreferrer" className="underline">
                  Navigate
                </a>
                {hasPin ? " — the customer's own dropped pin" : " — from the written address"}
              </p>
            ) : null}
            {addr ? null : (
              <p className="mt-1.5 text-[13px] font-medium text-neutral-500">
                No address recorded on this order.
              </p>
            )}
          </div>

          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-neutral-500">
              Details
            </p>
            <dl className="mt-1.5 space-y-1 text-[12.5px] font-medium text-ink">
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Order</dt>
                <dd className="tabular-nums font-semibold">{slip.orderNo}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Placed</dt>
                <dd className="tabular-nums">
                  {new Date(slip.placedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </dd>
              </div>
              {slip.warehouse && (
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">From</dt>
                  <dd>{slip.warehouse}</dd>
                </div>
              )}
              {slip.driver && (
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">Driver</dt>
                  <dd>{slip.driver}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <table className="mt-6 w-full text-left">
          <thead>
            <tr className="border-b border-neutral-200">
              <th className="pb-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-neutral-500">
                Item
              </th>
              <th className="pb-2 text-right text-[10.5px] font-bold uppercase tracking-[0.09em] text-neutral-500">
                Qty
              </th>
              {/* A box to tick as each line goes in. The slip is a checklist
                  before it is a record. */}
              <th className="w-12 pb-2 text-right text-[10.5px] font-bold uppercase tracking-[0.09em] text-neutral-500">
                ✓
              </th>
            </tr>
          </thead>
          <tbody>
            {slip.lines.map((l, i) => (
              <tr key={`${l.sku ?? l.title}-${i}`} className="border-b border-neutral-100">
                <td className="py-2.5">
                  <span className="block text-[13px] font-bold text-ink">{l.title}</span>
                  <span className="block text-[11.5px] font-semibold text-neutral-500">
                    {l.variantName}
                    {l.sku ? ` · ${l.sku}` : ""}
                  </span>
                </td>
                <td className="py-2.5 text-right text-[15px] font-extrabold tabular-nums text-ink">
                  {l.qty}
                </td>
                <td className="py-2.5 text-right">
                  <span className="ml-auto block size-4 rounded-[3px] border border-neutral-400" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex items-baseline justify-between border-t border-neutral-200 pt-3">
          <span className="text-[12.5px] font-bold text-neutral-500">
            {slip.lines.length} {slip.lines.length === 1 ? "line" : "lines"}
          </span>
          <span className="text-[15px] font-extrabold tabular-nums text-ink">
            {slip.totalUnits} {slip.totalUnits === 1 ? "unit" : "units"}
          </span>
        </div>

        <p className="mt-6 border-t border-neutral-200 pt-4 text-[11.5px] font-medium leading-[16px] text-neutral-500">
          Check the load against this list before the driver leaves. Anything torn,
          broken or not what you ordered goes back on the same vehicle — there is no
          charge and no form.
          {slip.ofShipments > 1 ? (
            <>
              {" "}
              This is one of {slip.ofShipments} deliveries for this order; the rest
              arrive separately.
            </>
          ) : null}
        </p>

        <p className="mt-2 text-[11px] font-medium leading-[15px] text-neutral-400">
          This is a packing slip, not a tax invoice. It carries no GSTIN and no HSN
          codes.
        </p>
      </main>
    </div>
  );
}
