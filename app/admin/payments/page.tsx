import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { adminListPayments, adminPaymentHealth } from "@/lib/services/admin/stock";
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
  const [{ payments, total, perPage }, health] = await Promise.all([
    adminListPayments(page),
    adminPaymentHealth(),
  ]);
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

      {/*
        "Payments & webhooks" — the figures the artboard leads with.

        Captured and failed today are what an accountant checks first. The
        unverified count is the one that should stop somebody's morning: a
        payment marked captured whose HMAC signature never verified means the
        gateway said one thing and our own check said another, and the money is
        in doubt.

        Two figures from the artboard are absent and cannot be computed. Webhook
        lag needs the gateway's event timestamp, and we store only our own.
        Duplicate events are *prevented* by the unique constraint on
        gatewayEventId rather than recorded, so a rejected duplicate leaves no
        row to count — measuring either means changing what we store, not
        reading it differently.
      */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-panel bg-white p-4 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
            Captured today
          </p>
          <p className="mt-1.5 text-[20px] font-extrabold tabular-nums text-ink">
            {formatPaise(health.capturedPaise)}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
            {health.capturedCount} {health.capturedCount === 1 ? "payment" : "payments"}
          </p>
        </div>

        <div className="rounded-panel bg-white p-4 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
            Failed today
          </p>
          <p className="mt-1.5 text-[20px] font-extrabold tabular-nums text-ink">
            {health.failedCount}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
            attempts that did not capture
          </p>
        </div>

        <div
          className={
            "rounded-panel p-4 shadow-card " +
            (health.unverifiedCapturedCount > 0 ? "bg-ops-bad-tint" : "bg-white")
          }
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
            Captured, signature unverified
          </p>
          <p
            className={
              "mt-1.5 text-[20px] font-extrabold tabular-nums " +
              (health.unverifiedCapturedCount > 0 ? "text-ops-bad" : "text-ink")
            }
          >
            {health.unverifiedCapturedCount}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
            {health.unverifiedCapturedCount > 0
              ? "the gateway and our check disagree — investigate"
              : "every capture verified"}
          </p>
        </div>

        <div className="rounded-panel bg-white p-4 shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
            Webhook lag
          </p>
          <p className="mt-1.5 text-[13px] font-semibold leading-[18px] text-ink-700">
            Not measurable — we record when we processed an event, not when the
            gateway sent it.
          </p>
        </div>
      </div>

      {gateway === "dummy" && (
        <div className="flex items-start gap-3 rounded-panel bg-ops-bad-tint p-4">
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

      <div className="overflow-x-auto rounded-panel bg-white p-4 shadow-card">
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

      {/*
        Gateway configuration — artboard 17. What is actually wired, without
        anybody needing shell access to find out.

        The artboard's own note says the system "silently falls back to dummy
        rather than failing loudly". That is no longer true and is not repeated
        here: assertPaymentConfig() runs from instrumentation.ts at server
        start and a production process refuses to boot on anything but
        razorpay-live with all three secrets present. The fallback survives in
        development only, which is where it belongs.

        No secret value is read or rendered — only whether each is present.
      */}
      <section className="rounded-panel bg-white p-4 shadow-card">
        <h2 className="text-[15px] font-bold tracking-tight">Gateway configuration</h2>
        <dl className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <Config
            label="Active gateway"
            value={gateway}
            note={gateway === "razorpay-live" ? "real money" : "no money is taken"}
          />
          <Config
            label="Razorpay keys"
            value={process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET ? "Set" : "Unset"}
            note="implemented in full either way"
          />
          <Config
            label="Webhook secret"
            value={process.env.RAZORPAY_WEBHOOK_SECRET ? "Set" : "Unset"}
            note="the webhook is what confirms an order"
          />
          <Config label="Signature check" value="timingSafeEqual" note="constant-time HMAC compare" />
        </dl>
        <p className="mt-3 text-[12px] font-medium leading-[17px] text-ink-700">
          Razorpay is implemented in full; it is not live because the keys are unset. A
          production server will not start on any other gateway —{" "}
          <code className="font-bold">assertPaymentConfig()</code> throws at boot rather
          than letting the site take an order it cannot charge for. Setting the three
          secrets in Vercel is the whole remaining step, and it is the owner&rsquo;s to
          take: nobody should paste a key into a console.
        </p>
      </section>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={{ pathname: "/admin/payments", query: { page: p } }}
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

function Config({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-field bg-chip-soft p-3">
      <dt className="text-[10px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
        {label}
      </dt>
      <dd className="mt-1 text-[13px] font-bold text-ink">{value}</dd>
      <dd className="text-[11.5px] font-semibold text-ink-500">{note}</dd>
    </div>
  );
}
