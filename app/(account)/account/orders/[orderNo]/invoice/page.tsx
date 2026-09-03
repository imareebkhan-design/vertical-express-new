import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth/current-user";
import { getOrderByNo, type OrderAddressSnapshot } from "@/lib/services/orders";
import { formatPaise } from "@/lib/money";
import { Logo } from "@/components/ui/logo";
import { PrintInvoiceButton } from "@/components/account/print-invoice-button";

/* The body of this page stopped calling itself a tax invoice in 677d08a; the
   title did not, and the title is the half that gets printed. Browsers put
   document.title in the header of a printed page, and this page exists to be
   printed — so a customer pressing Print still got a sheet headed "Tax Invoice"
   above a paragraph explaining that it is not one. */
export const metadata: Metadata = {
  title: "Order Summary | Vertical Express",
  robots: { index: false },
};

export default async function InvoicePage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const userId = await getAuthUserId();
  if (!userId) redirect(`/login?next=/account/orders/${orderNo}/invoice`);

  const order = await getOrderByNo(userId, orderNo);
  if (!order) notFound();

  const addr = order.address as unknown as OrderAddressSnapshot;

  // Backwards compatibility check
  const hasSnapshots = order.items.every((item) => item.subtotalPaise !== null);

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  let taxPaise = order.taxPaise;
  let ratePct = 18;
  let intraState = true;

  if (hasSnapshots) {
    order.items.forEach((item) => {
      cgstPaise += item.cgstPaise ?? 0;
      sgstPaise += item.sgstPaise ?? 0;
      igstPaise += item.igstPaise ?? 0;
    });
    intraState = igstPaise === 0;
    ratePct = order.subtotalPaise > 0 ? Math.round((taxPaise * 100) / order.subtotalPaise) : 18;
  } else {
    // Old exclusive math fallback (since computeGst has become inclusive, compute old exclusive values)
    const taxableBase = Math.max(0, order.subtotalPaise - order.discountPaise);
    const computedTax = Math.round(taxableBase * 0.18);
    taxPaise = computedTax;
    intraState = addr.state ? (addr.state.toLowerCase().includes("jammu") || addr.state.toLowerCase().includes("kashmir") || addr.state.toLowerCase() === "jk") : true;
    if (intraState) {
      sgstPaise = Math.floor(computedTax / 2);
      cgstPaise = computedTax - sgstPaise;
    } else {
      igstPaise = computedTax;
    }
  }

  const gst = {
    intraState,
    ratePct,
    taxPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
  };

  return (
    <div className="min-h-screen bg-neutral-100 py-8 px-4 font-sans print:bg-white print:p-0">
      {/* Print bar for screen */}
      <div className="mx-auto max-w-3xl mb-4 flex items-center justify-between print:hidden">
        <a href={`/account/orders/${order.orderNo}`} className="text-xs font-bold text-neutral-600 hover:text-ink">
          ← Back to Order Details
        </a>
        <PrintInvoiceButton className="flex items-center gap-2" />
      </div>

      {/* Invoice Document */}
      <main className="mx-auto max-w-3xl rounded-card border border-hairline-border bg-white p-8 shadow-card print:border-none print:shadow-none print:p-0">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-neutral-200 pb-6">
          {/*
            This document used to badge itself TAX INVOICE, number itself
            INV-<order no>, and print "Vertical Express Pvt Ltd, Commercial Hub,
            Lal Chowk, Srinagar" as a registered entity.

            None of that was true. A GST tax invoice must carry the supplier's
            GSTIN, an HSN code per line and the place of supply, and this
            carries none of them — /admin/invoices says so plainly, and the FAQ
            in lib/content.ts already tells customers "we are not issuing a GST
            invoice". The company name and address appeared nowhere else in the
            codebase; they were invented here, and the terms page lists exactly
            those fields as "[to be confirmed]".

            So a customer was being handed a fabricated legal entity on a
            document claiming a statutory status it does not have, and could
            reasonably have filed it. It is an order summary, and says so.
          */}
          <div>
            <Logo variant="horizontal" className="h-10" />
            <p className="mt-2 text-xs font-semibold text-neutral-500">
              Vertical Express — Srinagar, Jammu &amp; Kashmir<br />
              Support: hello@verticalexpress.in
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block rounded-full bg-brand-deep px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-brand">
              ORDER SUMMARY
            </span>
            <p className="mt-2 text-xs font-extrabold text-ink">Order #: {order.orderNo}</p>
            <p className="text-xs font-semibold text-neutral-500">
              Date: {new Date(order.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
        </div>

        {/* Addresses */}
        <div className="mt-6 grid grid-cols-2 gap-6 border-b border-neutral-200 pb-6 text-xs">
          <div>
            <h2 className="font-extrabold uppercase tracking-wider text-neutral-400">Billed & Shipped To:</h2>
            <p className="mt-1 font-extrabold text-ink">{addr.name}</p>
            <p className="font-semibold text-neutral-600">
              {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}<br />
              {addr.city}, {addr.state} — {addr.pincode}<br />
              Phone: {addr.phone}
            </p>
          </div>
          <div className="text-right">
            <h2 className="font-extrabold uppercase tracking-wider text-neutral-400">Payment Information:</h2>
            <p className="mt-1 font-extrabold capitalize text-ink">
              Method: {order.paymentMethod === "cod" ? "Pay on Delivery (COD)" : "Online Payment"}
            </p>
            <p className="font-semibold text-neutral-600">
              Status: {order.status === "delivered" || order.status === "confirmed" ? "PAID / AUTHORIZED" : order.status.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="mt-6 w-full text-left text-xs">
          <thead>
            <tr className="border-b-2 border-neutral-200 text-neutral-500 font-extrabold uppercase tracking-wider">
              <th className="py-2">Item Description</th>
              <th className="py-2 text-center">Qty</th>
              <th className="py-2 text-right">Unit Price</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 font-semibold text-neutral-700">
            {order.items.map((item) => {
              const unitPrice = hasSnapshots
                ? Math.round((item.taxableValuePaise ?? 0) / item.qty)
                : item.unitPricePaise;
              const total = hasSnapshots
                ? (item.taxableValuePaise ?? 0)
                : item.lineTotalPaise;
              return (
                <tr key={item.id}>
                  <td className="py-3 pr-2">
                    <span className="font-extrabold text-ink">{item.title}</span>
                    <br />
                    <span className="text-[11px] text-neutral-400">{item.variantName}</span>
                  </td>
                  <td className="py-3 text-center">{item.qty}</td>
                  <td className="py-3 text-right">{formatPaise(unitPrice)}</td>
                  <td className="py-3 text-right font-extrabold text-ink">{formatPaise(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals Summary */}
        <div className="mt-6 flex justify-end border-t border-neutral-200 pt-4">
          <dl className="w-64 space-y-1.5 text-xs font-semibold">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Subtotal</dt>
              <dd className="font-extrabold text-ink">{formatPaise(order.subtotalPaise)}</dd>
            </div>
            {order.discountPaise > 0 && (
              <div className="flex justify-between text-success">
                <dt>Discount</dt>
                <dd>-{formatPaise(order.discountPaise)}</dd>
              </div>
            )}
            {!gst.intraState ? (
              <div className="flex justify-between">
                <dt className="text-neutral-500">IGST ({gst.ratePct}%)</dt>
                <dd>{formatPaise(gst.taxPaise)}</dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">CGST ({(gst.ratePct / 2).toFixed(1)}%)</dt>
                  <dd>{formatPaise(gst.cgstPaise)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">SGST ({(gst.ratePct / 2).toFixed(1)}%)</dt>
                  <dd>{formatPaise(gst.sgstPaise)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between">
              <dt className="text-neutral-500">Delivery Fee</dt>
              <dd>{order.deliveryFeePaise === 0 ? "FREE" : formatPaise(order.deliveryFeePaise)}</dd>
            </div>
            <div className="flex justify-between border-t-2 border-neutral-200 pt-2 text-sm font-extrabold text-ink">
              <dt>Total (Incl. Taxes)</dt>
              <dd>{formatPaise(order.totalPaise)}</dd>
            </div>
          </dl>
        </div>

        {/* Footer Note */}
        <div className="mt-12 border-t border-neutral-200 pt-4 text-center text-[11px] font-semibold text-neutral-400">
          <p>Thank you for shopping with Vertical Express.</p>
          {/* Says what the document is not, because the tax breakup above makes
              it look like something it is not. The figures are real — a
              per-line snapshot taken at order time — but a GST tax invoice
              needs a supplier GSTIN, an HSN code per line and the place of
              supply, and none of those exists yet. */}
          <p className="mt-1">
            This is an order summary, not a GST tax invoice. The tax shown is what you
            were charged. A tax invoice will be issued separately once GST registration
            is in place.
          </p>
        </div>
      </main>
    </div>
  );
}
