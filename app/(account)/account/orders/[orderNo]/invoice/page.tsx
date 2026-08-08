import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { getAuthUserId } from "@/lib/supabase/server";
import { getOrderByNo, type OrderAddressSnapshot } from "@/lib/services/orders";
import { formatPaise } from "@/lib/money";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Tax Invoice | Vertical Express",
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
        <Button onClick={() => undefined} className="flex items-center gap-2" id="print-btn">
          <Printer className="size-4" /> Print / Download PDF
        </Button>

        <script
          dangerouslySetInnerHTML={{
            __html: `document.getElementById('print-btn')?.addEventListener('click', function() { window.print(); });`,
          }}
        />
      </div>

      {/* Invoice Document */}
      <main className="mx-auto max-w-3xl rounded-card border border-hairline-border bg-white p-8 shadow-card print:border-none print:shadow-none print:p-0">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-neutral-200 pb-6">
          <div>
            <Logo variant="horizontal" className="h-10" />
            <p className="mt-2 text-xs font-semibold text-neutral-500">
              Vertical Express Pvt Ltd<br />
              Commercial Hub, Lal Chowk, Srinagar, J&K — 190001<br />
              GSTIN: 01AABCV1234F1Z0 | Support: care@verticalexpress.in
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block rounded-md bg-brand-deep px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-brand">
              TAX INVOICE
            </span>
            <p className="mt-2 text-xs font-extrabold text-ink">Invoice #: INV-{order.orderNo}</p>
            <p className="text-xs font-semibold text-neutral-500">Order #: {order.orderNo}</p>
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
          <p>Thank you for shopping with Vertical Express! This is a computer-generated tax invoice.</p>
        </div>
      </main>
    </div>
  );
}
