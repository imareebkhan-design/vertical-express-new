import Link from "next/link";
import { AlertTriangle, Box, Warehouse } from "lucide-react";
import { adminListStock, type StockFilter } from "@/lib/services/admin/stock";
import { formatPaise } from "@/lib/money";
import { StatusChip } from "@/components/admin/status-chip";

export const dynamic = "force-dynamic";

const FILTERS: { key: StockFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "low", label: "Low" },
  { key: "out", label: "Out of stock" },
];

export default async function AdminInventory({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ?? "all") as StockFilter;
  const page = sp.page ? parseInt(sp.page, 10) || 1 : 1;
  const s = await adminListStock(filter, page);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Inventory</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
          {s.total} stock rows · {s.lowCount} low · {s.outCount} out
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center gap-2">
            <span className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              Units on hand
            </span>
            <span className="flex-1" />
            <Warehouse className="size-4 text-ink-500" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight">{s.totalUnits}</p>
          <p className="mt-1 text-[11px] font-semibold text-ink-500">across all warehouses</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center gap-2">
            <span className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              At or below {s.threshold}
            </span>
            <span className="flex-1" />
            <Box className="size-4 text-ink-500" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight text-ops-warn">
            {s.lowCount}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-ink-500">needs a purchase decision</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-center gap-2">
            <span className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              Out of stock
            </span>
            <span className="flex-1" />
            <AlertTriangle className="size-4 text-ink-500" aria-hidden />
          </div>
          <p className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight text-ops-bad">
            {s.outCount}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-ink-500">blocking any order that wants them</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/admin/inventory" : `/admin/inventory?filter=${f.key}`}
            className={`inline-flex h-8 items-center rounded-xl px-3.5 text-[12px] transition-colors ${
              f.key === filter
                ? "bg-ink font-bold text-white"
                : "bg-chip font-semibold text-ink hover:bg-hush"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-card">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              <th className="px-3 pb-2.5">Product</th>
              <th className="px-3 pb-2.5">SKU</th>
              <th className="px-3 pb-2.5">Warehouse</th>
              <th className="px-3 pb-2.5 text-right">On hand</th>
              <th className="px-3 pb-2.5 text-right">Reserved</th>
              <th className="px-3 pb-2.5 text-right">Available</th>
              <th className="px-3 pb-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r) => (
              <tr key={`${r.variantId}-${r.warehouseId}`} className="border-t border-line">
                <td className="px-3 py-3">
                  <Link
                    href={`/product/${r.productSlug}`}
                    className="text-[12.5px] font-bold hover:underline"
                  >
                    {r.productTitle}
                  </Link>
                  <p className="text-[11px] font-semibold text-ink-500">
                    {r.variantName} · {formatPaise(r.pricePaise)}
                  </p>
                </td>
                <td className="px-3 py-3 text-[11px] font-semibold tabular-nums text-ink-500">
                  {r.sku}
                </td>
                <td className="px-3 py-3 text-[12px] font-semibold">{r.warehouseName}</td>
                <td className="px-3 py-3 text-right text-[12.5px] font-bold tabular-nums">
                  {r.qtyOnHand}
                </td>
                <td className="px-3 py-3 text-right text-[12px] font-semibold tabular-nums text-ink-500">
                  {r.qtyReserved}
                </td>
                <td className="px-3 py-3 text-right text-[12.5px] font-bold tabular-nums">
                  {r.available}
                </td>
                <td className="px-3 py-3">
                  {r.qtyOnHand <= 0 ? (
                    <StatusChip tone="bad">Out of stock</StatusChip>
                  ) : r.qtyOnHand <= s.threshold ? (
                    <StatusChip tone="warn">Low</StatusChip>
                  ) : (
                    <StatusChip tone="ok">Healthy</StatusChip>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.rows.length === 0 && (
          <p className="py-10 text-center text-[13px] font-semibold text-ink-500">
            Nothing matches this filter.
          </p>
        )}
      </div>

      <p className="rounded-2xl bg-ops-info-tint p-4 text-[12px] font-semibold leading-relaxed text-ops-info">
        Read-only. Stock adjustment is not offered here because there is no movement
        ledger — quantity would change with no reason, no reference and no actor
        recorded. Adjustment arrives with that ledger (ISS-015).
      </p>
    </div>
  );
}
