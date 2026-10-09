import type { Metadata } from "next";
import Link from "next/link";
import { getAdminUser } from "@/lib/services/admin/authz";
import { listProductEnquiries } from "@/lib/services/product-enquiries";
import { EnquiryStatus } from "@/components/admin/enquiry-status";

export const metadata: Metadata = { title: "Enquiries | Operations", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Product enquiries from catalog-only listings ("Enquire about this product").
 * Nothing notifies anyone yet — this queue is the only place they appear, so it
 * has to be checked (owner decision, 9 Oct 2026).
 */
export default async function AdminEnquiries() {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const enquiries = await listProductEnquiries();

  return (
    <div>
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight">Product enquiries ({enquiries.length})</h1>
      <p className="mb-6 text-sm font-semibold text-neutral-500">
        No email or WhatsApp alert is sent for new enquiries yet — check this page.
      </p>
      <div className="overflow-x-auto rounded-card border border-neutral-100 bg-white shadow-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-neutral-100 text-left text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">
            <tr>
              <th className="px-4 py-3">Enquiry</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Quantity / message</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {enquiries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center font-semibold text-neutral-400">No enquiries yet.</td>
              </tr>
            ) : (
              enquiries.map((e) => (
                <tr key={e.id} className="align-top font-bold">
                  <td className="whitespace-nowrap px-4 py-3">
                    {e.enquiryNo}
                    <br />
                    <span className="text-xs font-semibold text-neutral-500">{e.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/product/${e.product.slug}`} className="underline-offset-2 hover:underline">{e.productTitle}</Link>
                    <br />
                    <span className="text-xs font-semibold text-neutral-500">{e.brandName}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-neutral-600">
                    {e.name}
                    <br />
                    <span className="text-xs">{e.phone}</span>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs font-semibold text-neutral-500">
                    {e.quantity && <span className="block">Qty: {e.quantity}</span>}
                    {e.message && <span className="line-clamp-3">{e.message}</span>}
                  </td>
                  <td className="px-4 py-3"><EnquiryStatus id={e.id} status={e.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
