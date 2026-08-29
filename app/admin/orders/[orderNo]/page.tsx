import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { adminGetOrder, nextOrderStatuses } from "@/lib/services/admin/manage";
import { formatPaise } from "@/lib/money";
import { StatusControl } from "@/components/admin/status-control";
import {
  OrderStatusChip,
  PaymentStatusChip,
  StatusChip,
} from "@/components/admin/status-chip";

export const dynamic = "force-dynamic";

function Panel({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-panel bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
        <span className="flex-1" />
        {right}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <span className="text-[11px] font-semibold text-ink-500">{label}</span>
      <span className="text-right text-[12px] font-bold">{value}</span>
    </div>
  );
}

export default async function AdminOrderDetail({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const { orderNo } = await params;
  const order = await adminGetOrder(orderNo);
  if (!order) notFound();

  const addr = (order.address ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof addr[k] === "string" ? (addr[k] as string) : "");
  const payment = order.payments[0];

  // GST is stored per line as a snapshot. Summing the lines is the only correct
  // way to show the breakup — the catalogue rate may have changed since.
  //
  // The tax columns are nullable: they arrived in the `order_tax_paise` migration,
  // so orders placed before it genuinely carry no breakup. Those are reported as
  // missing rather than rendered as zeros, which would read as a bug.
  const hasTaxBreakup = order.items.some((i) => i.taxableValuePaise !== null);
  const cgst = order.items.reduce((s, i) => s + (i.cgstPaise ?? 0), 0);
  const sgst = order.items.reduce((s, i) => s + (i.sgstPaise ?? 0), 0);
  const igst = order.items.reduce((s, i) => s + (i.igstPaise ?? 0), 0);
  const taxable = order.items.reduce((s, i) => s + (i.taxableValuePaise ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/orders"
          className="grid size-9 place-items-center rounded-chip bg-chip transition-colors hover:bg-hush"
          aria-label="Back to orders"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div>
          <h1 className="text-[22px] font-extrabold tabular-nums tracking-tight">
            {order.orderNo}
          </h1>
          <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
            {order.placedAt.toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {order.warehouse ? ` · ${order.warehouse.name}` : ""}
          </p>
        </div>
        <span className="flex-1" />
        <OrderStatusChip status={order.status} />
        <StatusControl
          kind="order"
          id={order.id}
          options={nextOrderStatuses(order.status)}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title={`Items (${order.items.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
                    <th className="px-2 pb-2.5">Item</th>
                    <th className="px-2 pb-2.5">HSN</th>
                    <th className="px-2 pb-2.5 text-right">Qty</th>
                    <th className="px-2 pb-2.5 text-right">Unit</th>
                    <th className="px-2 pb-2.5 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.id} className="border-t border-line">
                      <td className="px-2 py-2.5">
                        <p className="text-[12.5px] font-bold">{i.title}</p>
                        <p className="text-[11px] font-semibold text-ink-500">{i.variantName}</p>
                      </td>
                      <td className="px-2 py-2.5 text-[11px] font-semibold tabular-nums text-ink-500">
                        {i.hsnCode ?? "—"}
                        <span className="block">{String(i.gstRate)}%</span>
                      </td>
                      <td className="px-2 py-2.5 text-right text-[12.5px] font-bold tabular-nums">
                        {i.qty}
                      </td>
                      <td className="px-2 py-2.5 text-right text-[12px] font-semibold tabular-nums">
                        {formatPaise(i.unitPricePaise)}
                      </td>
                      <td className="px-2 py-2.5 text-right text-[12.5px] font-bold tabular-nums">
                        {formatPaise(i.totalPaise ?? i.lineTotalPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Timeline">
            <ol className="flex flex-col gap-3">
              {order.statusEvents.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="mt-1.5 size-2 flex-none rounded-full bg-ink" aria-hidden />
                  <div>
                    <p className="text-[12.5px] font-bold">
                      {e.fromStatus ? `${e.fromStatus} → ` : ""}
                      {e.toStatus}
                    </p>
                    <p className="text-[11px] font-semibold text-ink-500">
                      {e.createdAt.toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {e.note ? ` · ${e.note}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel title="Customer">
            <p className="text-[13px] font-bold">{str("name") || "—"}</p>
            <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-ink-500">
              {str("phone") || order.user?.phone || "—"}
            </p>
            <div className="my-3 h-px bg-line" />
            <p className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              Delivering to
            </p>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-relaxed">
              {[str("line1"), str("line2"), str("landmark")].filter(Boolean).join(", ")}
              <br />
              {[str("city"), str("state")].filter(Boolean).join(", ")}{" "}
              <span className="tabular-nums">{str("pincode")}</span>
            </p>
            {order.notes && (
              <p className="mt-3 rounded-panel bg-canvas p-2.5 text-[11px] font-semibold text-ink-700">
                {order.notes}
              </p>
            )}
          </Panel>

          <Panel
            title="Payment"
            right={payment ? <PaymentStatusChip status={payment.status} /> : undefined}
          >
            <Row label="Method" value={order.paymentMethod} />
            {payment && (
              <>
                <Row label="Gateway" value={payment.gateway} />
                <Row
                  label="Signature verified"
                  value={
                    payment.signatureVerified ? (
                      <StatusChip tone="ok">Verified</StatusChip>
                    ) : (
                      <StatusChip tone="warn">Not verified</StatusChip>
                    )
                  }
                />
                {payment.gatewayPaymentId && (
                  <Row
                    label="Gateway payment"
                    value={<span className="tabular-nums">{payment.gatewayPaymentId}</span>}
                  />
                )}
              </>
            )}
          </Panel>

          <Panel title="Bill">
            {hasTaxBreakup ? (
              <>
                <Row label="Taxable value" value={formatPaise(taxable)} />
                {igst > 0 ? (
                  <Row label="IGST" value={formatPaise(igst)} />
                ) : (
                  <>
                    <Row label="CGST" value={formatPaise(cgst)} />
                    <Row label="SGST" value={formatPaise(sgst)} />
                  </>
                )}
              </>
            ) : (
              <Row
                label="Tax breakup"
                value={<StatusChip tone="warn">Not recorded</StatusChip>}
              />
            )}
            {order.discountPaise > 0 && (
              <Row label="Discount" value={`− ${formatPaise(order.discountPaise)}`} />
            )}
            <Row label="Delivery" value={formatPaise(order.deliveryFeePaise)} />
            <div className="my-2 h-px bg-line" />
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold">Total</span>
              <span className="text-lg font-extrabold tabular-nums">
                {formatPaise(order.totalPaise)}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] font-semibold text-ink-500">
              {hasTaxBreakup
                ? "Prices are GST-inclusive; the breakup is a per-line snapshot taken at order time."
                : "This order predates per-line tax capture, so no breakup was stored."}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
