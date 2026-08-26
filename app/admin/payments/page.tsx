import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { adminListPayments } from "@/lib/services/admin/stock";
import { activeGateway } from "@/lib/services/payments";
import { formatPaise } from "@/lib/money";
import { OrderStatusChip, PaymentStatusChip, StatusChip } from "@/components/admin/status-chip";

export const dynamic = "force-dynamic";

export default async function AdminPayments({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page, 10) || 1 : 1;
  const { payments, total, perPage } = await adminListPayments(page);
  const pages = Math.max(1, Math.ceil(total / perPage));

  let gateway = "unknown";
  try {
    gateway = activeGateway();
  } catch {
    gateway = "misconfigured";
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Payments</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
          {total} payment records · active gateway: {gateway}
        </p>
      </div>

      {gateway === "dummy" && (
        <div className="flex items-start gap-3 rounded-2xl bg-ops-bad-tint p-4">
          <AlertTriangle className="mt-0.5 size-5 flex-none text-ops-bad" aria-hidden />
          <div>
            <p className="text-[13px] font-extrabold text-ops-bad">
              The active gateway is `dummy`
            </p>
            <p className="mt-1 text-[12px] font-semibold leading-relaxed text-ops-bad">
              Every capture below was simulated. No money has moved. Razorpay is fully
              implemented — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET and switch
              PAYMENT_GATEWAY to go live (ISS-002).
            </p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-card">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              <th className="px-3 pb-2.5">Order</th>
              <th className="px-3 pb-2.5">Gateway</th>
              <th className="px-3 pb-2.5 text-right">Amount</th>
              <th className="px-3 pb-2.5">Payment</th>
              <th className="px-3 pb-2.5">Signature</th>
              <th className="px-3 pb-2.5">Order status</th>
              <th className="px-3 pb-2.5">When</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const mismatch = p.order != null && p.amountPaise !== p.order.totalPaise;
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-3 py-3">
                    {p.order ? (
                      <Link
                        href={`/admin/orders/${p.order.orderNo}`}
                        className="text-[12.5px] font-bold tabular-nums hover:underline"
                      >
                        {p.order.orderNo}
                      </Link>
                    ) : (
                      <span className="text-[12px] font-semibold text-ink-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <StatusChip tone={p.gateway === "dummy" ? "bad" : "neutral"}>
                      {p.gateway}
                    </StatusChip>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-[12.5px] font-bold tabular-nums">
                      {formatPaise(p.amountPaise)}
                    </span>
                    {mismatch && (
                      <span className="mt-1 block">
                        <StatusChip tone="bad">≠ order total</StatusChip>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <PaymentStatusChip status={p.status} />
                  </td>
                  <td className="px-3 py-3">
                    <StatusChip tone={p.signatureVerified ? "ok" : "warn"}>
                      {p.signatureVerified ? "Verified" : "Not verified"}
                    </StatusChip>
                  </td>
                  <td className="px-3 py-3">
                    {p.order ? <OrderStatusChip status={p.order.status} /> : "—"}
                  </td>
                  <td className="px-3 py-3 text-[11px] font-semibold text-ink-500">
                    {p.createdAt.toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {payments.length === 0 && (
          <p className="py-10 text-center text-[13px] font-semibold text-ink-500">
            No payments recorded yet.
          </p>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={{ pathname: "/admin/payments", query: { page: p } }}
              className={`grid size-9 place-items-center rounded-xl text-[12px] tabular-nums transition-colors ${
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
