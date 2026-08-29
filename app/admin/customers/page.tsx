import Link from "next/link";
import { Users } from "lucide-react";
import { adminListCustomers } from "@/lib/services/admin/stock";
import { formatPaise } from "@/lib/money";
import { StatusChip } from "@/components/admin/status-chip";

export const dynamic = "force-dynamic";

export default async function AdminCustomers({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page, 10) || 1 : 1;
  const c = await adminListCustomers(page, 30, sp.q);
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
                      <p className="text-[12.5px] font-bold tabular-nums">{u.phone ?? "—"}</p>
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

      <p className="rounded-panel bg-ops-info-tint p-4 text-[12px] font-semibold leading-relaxed text-ops-info">
        No notes, tickets or segments — there is no CRM model in the schema. This is what
        the order data honestly supports.
      </p>
    </div>
  );
}
