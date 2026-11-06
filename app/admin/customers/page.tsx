import Link from "next/link";
import { Users } from "lucide-react";
import { adminListCustomers, adminCustomerMix } from "@/lib/services/admin/stock";
import { formatPaise } from "@/lib/money";
import { StatusChip } from "@/components/admin/status-chip";
import { getAdminUser } from "@/lib/services/admin/authz";

export const dynamic = "force-dynamic";

export default async function AdminCustomers({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page, 10) || 1 : 1;
  const [c, mix] = await Promise.all([
    adminListCustomers(page, 30, sp.q),
    adminCustomerMix(),
  ]);
  const pages = Math.max(1, Math.ceil(c.total / c.perPage));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Customers</h1>
          <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
            {c.total} {c.total === 1 ? "customer" : "customers"}
            {sp.q ? ` matching “${sp.q}”` : ""}
          </p>
        </div>
        <span className="flex-1" />
        <form action="/admin/customers" className="flex items-center gap-2">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search phone or email"
            aria-label="Search customers"
            className="h-9 w-56 rounded-field bg-chip-soft px-3.5 text-[12.5px] font-semibold text-ink placeholder:text-ink-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          />
          <button className="h-9 rounded-panel bg-ink px-4 text-[12px] font-bold text-white">
            Search
          </button>
        </form>
      </div>

      {/*
        The two figures the artboard leads with.

        Repeat rate is the one that says whether the business works. A
        construction supplier lives on the same contractor coming back every
        fortnight, not on acquisition, so this is the number to watch before any
        revenue chart. Customers who have never ordered are out of the
        denominator — they have not had a chance to repeat, and including them
        moves the figure with marketing spend rather than with the product.

        The mix will read mostly "not asked" for a while: the "I'm a…" step is
        skippable on purpose and nobody who signed up before it existed has
        answered. That is reported as its own bucket rather than folded into
        homeowners, so the number is not quietly wrong.
      */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-panel bg-white p-4 shadow-card">
          <p className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
            Repeat rate
          </p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight">
            {mix.repeatRatePct === null ? "—" : `${mix.repeatRatePct}%`}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-ink-500">
            {mix.repeatCustomers} of {mix.orderingCustomers} who have ordered came back
          </p>
        </div>
        <div className="rounded-panel bg-white p-4 shadow-card">
          <p className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
            Contractors
          </p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight">
            {mix.mix.contractor}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-ink-500">said so at sign-up</p>
        </div>
        <div className="rounded-panel bg-white p-4 shadow-card">
          <p className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
            Homeowners &amp; designers
          </p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight">
            {mix.mix.homeowner + mix.mix.designer}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-ink-500">
            {mix.mix.homeowner} renovating · {mix.mix.designer} designing
          </p>
        </div>
        <div className="rounded-panel bg-white p-4 shadow-card">
          <p className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
            Not asked
          </p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight text-ink-500">
            {mix.mix.unknown}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-ink-500">
            skipped the question, or signed up before it existed
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-panel bg-white p-4 shadow-card">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              <th className="px-3 pb-2.5">Customer</th>
              <th className="px-3 pb-2.5">Joined</th>
              <th className="px-3 pb-2.5 text-right">Orders</th>
              <th className="px-3 pb-2.5 text-right">Lifetime value</th>
              <th className="px-3 pb-2.5">Last order</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-8 flex-none place-items-center rounded-full bg-amber-soft">
                      <Users className="size-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/admin/customers/${u.id}`}
                        className="text-[12.5px] font-bold tabular-nums text-ink no-underline hover:underline"
                      >
                        {u.phone ?? u.email ?? "Customer"}
                      </Link>
                      <p className="truncate text-[11px] font-semibold text-ink-500">
                        {u.email ?? "no email"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-[12px] font-semibold text-ink-500">
                  {u.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </td>
                <td className="px-3 py-3 text-right text-[12.5px] font-bold tabular-nums">
                  {u.orderCount}
                </td>
                <td className="px-3 py-3 text-right text-[12.5px] font-bold tabular-nums">
                  {formatPaise(u.lifetimePaise)}
                </td>
                <td className="px-3 py-3">
                  {u.lastOrderAt ? (
                    <span className="text-[12px] font-semibold">
                      {u.lastOrderAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  ) : (
                    <StatusChip tone="neutral">Never ordered</StatusChip>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {c.rows.length === 0 && (
          <p className="py-10 text-center text-[13px] font-semibold text-ink-500">
            No customers found.
          </p>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={{ pathname: "/admin/customers", query: { ...(sp.q ? { q: sp.q } : {}), page: p } }}
              className={`grid size-9 place-items-center rounded-chip text-[12px] tabular-nums transition-colors ${
                p === page ? "bg-ink font-bold text-white" : "bg-chip font-semibold hover:bg-hush"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}

    </div>
  );
}
