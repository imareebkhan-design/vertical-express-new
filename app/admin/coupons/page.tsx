import { adminListCoupons } from "@/lib/services/admin/stock";
import { formatPaise } from "@/lib/money";
import { StatusChip } from "@/components/admin/status-chip";

export const dynamic = "force-dynamic";

function describe(c: Awaited<ReturnType<typeof adminListCoupons>>[number]): string {
  if (c.type === "percent") {
    const cap = c.maxDiscountPaise ? `, max ${formatPaise(c.maxDiscountPaise)}` : "";
    return `${c.value}% off${cap}`;
  }
  if (c.type === "flat") return `${formatPaise(c.value)} off`;
  return "Free delivery";
}

export default async function AdminCoupons() {
  const coupons = await adminListCoupons();
  const now = new Date();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Coupons</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
          {coupons.filter((c) => c.isActive).length} active of {coupons.length}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-card">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              <th className="px-3 pb-2.5">Code</th>
              <th className="px-3 pb-2.5">Discount</th>
              <th className="px-3 pb-2.5 text-right">Minimum</th>
              <th className="px-3 pb-2.5 text-right">Per user</th>
              <th className="px-3 pb-2.5 text-right">Usage limit</th>
              <th className="px-3 pb-2.5">Window</th>
              <th className="px-3 pb-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => {
              const expired = c.endsAt != null && c.endsAt < now;
              const scheduled = c.startsAt != null && c.startsAt > now;
              return (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-3 py-3 text-[12.5px] font-bold tabular-nums">{c.code}</td>
                  <td className="px-3 py-3 text-[12px] font-semibold">{describe(c)}</td>
                  <td className="px-3 py-3 text-right text-[12px] font-semibold tabular-nums">
                    {c.minOrderPaise > 0 ? formatPaise(c.minOrderPaise) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-[12px] font-semibold tabular-nums">
                    {c.perUserLimit}
                  </td>
                  <td className="px-3 py-3 text-right text-[12px] font-semibold tabular-nums">
                    {c.usageLimit ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-[11px] font-semibold text-ink-500">
                    {c.startsAt
                      ? c.startsAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                      : "—"}
                    {" → "}
                    {c.endsAt
                      ? c.endsAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                      : "no end"}
                  </td>
                  <td className="px-3 py-3">
                    {!c.isActive ? (
                      <StatusChip tone="neutral">Disabled</StatusChip>
                    ) : expired ? (
                      <StatusChip tone="neutral">Expired</StatusChip>
                    ) : scheduled ? (
                      <StatusChip tone="info">Scheduled</StatusChip>
                    ) : (
                      <StatusChip tone="ok">Active</StatusChip>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {coupons.length === 0 && (
          <p className="py-10 text-center text-[13px] font-semibold text-ink-500">
            No coupons configured.
          </p>
        )}
      </div>

      <p className="rounded-2xl bg-ops-warn-tint p-4 text-[12px] font-semibold leading-relaxed text-ops-warn">
        Coupon wiring in the cart is incomplete (ISS-011): a code can be displayed as
        applied without being deducted server-side. Treat the discounts listed here as
        configured intent, not as what a customer is actually charged, until that is fixed.
      </p>
    </div>
  );
}
