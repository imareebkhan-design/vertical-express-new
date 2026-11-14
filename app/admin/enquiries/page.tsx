import type { Metadata } from "next";
import Link from "next/link";
import { getAdminUser } from "@/lib/services/admin/authz";
import { ENQUIRY_STATUSES, listProductEnquiries } from "@/lib/services/product-enquiries";
import { EnquiryStatus } from "@/components/admin/enquiry-status";

export const metadata: Metadata = { title: "Enquiries | Operations", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Product enquiries from catalog-only listings ("Enquire about this product").
 * Nothing notifies anyone yet — this queue is the only place they appear, so it
 * has to be checked (owner decision, 9 Oct 2026).
 */
export default async function AdminEnquiries({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const params = await searchParams;
  const status = ENQUIRY_STATUSES.find((s) => s === params.status);
  const page = /^\d{1,6}$/.test(params.page ?? "") ? Math.max(1, Number(params.page)) : 1;
  const pageSize = 50;
  const rows = await listProductEnquiries(status, pageSize + 1, (page - 1) * pageSize);
  const hasNext = rows.length > pageSize;
  const enquiries = rows.slice(0, pageSize);
  const pageHref = (n: number) => `/admin/enquiries?${new URLSearchParams({ page: String(n), ...(status ? { status } : {}) })}`;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight">Product enquiries</h1>
      <p className="mb-6 text-sm font-semibold text-neutral-500">
        The owner handles enquiries in this inbox. No email or WhatsApp alerts are sent — check new enquiries here and update their status after following up.
      </p>
      <form className="mb-4 flex items-center gap-3">
        <label htmlFor="enquiry-filter">Status</label>
        <select id="enquiry-filter" name="status" defaultValue={status ?? ""} className="rounded-field border p-2">
          <option value="">All</option>
          {ENQUIRY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="submit" className="rounded-field border px-3 py-2">Apply</button>
      </form>
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
                    {e.message && <span className="whitespace-pre-wrap break-words">{e.message}</span>}
                  </td>
                  <td className="px-4 py-3"><EnquiryStatus id={e.id} status={e.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <nav aria-label="Enquiry pages" className="mt-4 flex items-center gap-4">
        {page > 1 && <Link href={pageHref(page - 1)}>Previous</Link>}
        <span>Page {page}</span>
        {hasNext && <Link href={pageHref(page + 1)}>Next</Link>}
      </nav>
    </div>
  );
}
