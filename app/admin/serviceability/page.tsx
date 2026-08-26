import { adminListServiceability } from "@/lib/services/admin/stock";
import { formatPaise } from "@/lib/money";
import { StatusChip } from "@/components/admin/status-chip";

export const dynamic = "force-dynamic";

export default async function AdminServiceability() {
  const { pincodes, warehouses } = await adminListServiceability();
  const active = pincodes.filter((p) => p.isActive).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Serviceability</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
          {active} of {pincodes.length} pincodes active · {warehouses.length}{" "}
          {warehouses.length === 1 ? "warehouse" : "warehouses"}
        </p>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-card">
        <h2 className="mb-3 text-[15px] font-bold tracking-tight">Warehouses</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((w) => (
            <li key={w.id} className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold">{w.name}</p>
                <p className="text-[11px] font-semibold text-ink-500">
                  {w.city} · <span className="tabular-nums">{w.pincode}</span>
                </p>
              </div>
              <StatusChip tone={w.isActive ? "ok" : "neutral"}>
                {w.isActive ? "Active" : "Inactive"}
              </StatusChip>
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-x-auto rounded-2xl bg-white p-4 shadow-card">
        <h2 className="mb-3 text-[15px] font-bold tracking-tight">Pincodes</h2>
        <table className="w-full min-w-[680px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              <th className="px-3 pb-2.5">Pincode</th>
              <th className="px-3 pb-2.5">Warehouse</th>
              <th className="px-3 pb-2.5 text-right">Express window</th>
              <th className="px-3 pb-2.5 text-right">Delivery fee</th>
              <th className="px-3 pb-2.5">COD</th>
              <th className="px-3 pb-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {pincodes.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-3 py-3 text-[12.5px] font-bold tabular-nums">{p.pincode}</td>
                <td className="px-3 py-3 text-[12px] font-semibold">
                  {p.warehouse.name}
                  <span className="block text-[11px] font-semibold text-ink-500">
                    {p.warehouse.city}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-[12.5px] font-semibold tabular-nums">
                  {p.etaMinutes} min
                </td>
                <td className="px-3 py-3 text-right text-[12.5px] font-bold tabular-nums">
                  {p.deliveryFeePaise === 0 ? "Free" : formatPaise(p.deliveryFeePaise)}
                </td>
                <td className="px-3 py-3">
                  <StatusChip tone={p.codAllowed ? "ok" : "neutral"}>
                    {p.codAllowed ? "Allowed" : "Off"}
                  </StatusChip>
                </td>
                <td className="px-3 py-3">
                  <StatusChip tone={p.isActive ? "ok" : "neutral"}>
                    {p.isActive ? "Serving" : "Paused"}
                  </StatusChip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pincodes.length === 0 && (
          <p className="py-10 text-center text-[13px] font-semibold text-ink-500">
            No serviceable pincodes configured. Checkout will reject every address.
          </p>
        )}
      </section>

      <p className="rounded-2xl bg-ops-info-tint p-4 text-[12px] font-semibold leading-relaxed text-ops-info">
        Read-only for now. This table is what the storefront uses to decide whether it can
        take an order, what it charges for delivery and whether COD is offered — editing it
        changes what customers are promised, so it needs an audit trail before it becomes
        writable (ISS-015). Slot capacity is not here because slots do not exist yet.
      </p>
    </div>
  );
}
