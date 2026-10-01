import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { adminGetOrder, nextOrderStatuses } from "@/lib/services/admin/manage";
import { formatPaise } from "@/lib/money";
import { splitOrderPayments } from "@/lib/payment-rows";
import { StatusControl } from "@/components/admin/status-control";
import {
  OrderStatusChip,
  PaymentStatusChip,
  StatusChip,
} from "@/components/admin/status-chip";
import { getAdminUser } from "@/lib/services/admin/authz";
import { ExpressRunBadge, OrderExpressSelection } from "@/components/orders/express-selection";

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
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const { orderNo } = await params;
  const order = await adminGetOrder(orderNo);
  if (!order) notFound();

  const addr = (order.address ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof addr[k] === "string" ? (addr[k] as string) : "");
  /* Not `payments[0]` (newest): after a second capture (ISS-075) that is the
     refund-bound payment, and it would hide the one that paid for the order. */
  const { primary: payment, secondCaptures } = splitOrderPayments(order.payments);

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
  /* Read off what was actually charged rather than re-deriving it from the
     address: the split was decided at order time and is the snapshot that has
     to hold. An order with no IGST on any line was billed intra-state. */
  const intraState = igst === 0;

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

          {/*
            Shipments — the physical half of the order, and the reason a
            dispatcher opens this page. The console showed what was bought and
            nothing about how it reaches anybody.

            The delivery code is here because it is the number a driver is asked
            for at the gate; when a customer rings support saying the driver has
            no code, this is where it gets read out.

            Driver and vehicle now exist and are assigned from the dispatch
            board. The promised slot does not — there are no delivery slots
            (ISS-057) — so that one is named rather than blanked, to make clear
            the data is absent rather than the shipment unscheduled.
          */}
          <Panel title="Shipments">
            {order.shipments.length === 0 ? (
              <p className="text-[12px] font-semibold text-ink-500">
                No shipments recorded. Orders placed before the shipment split shipped as
                one undifferentiated delivery.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {order.shipments.map((sh) => (
                  <div key={sh.id} className="rounded-[12px] bg-canvas p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13px] font-bold text-ink">
                        Shipment {sh.sequence}
                        <span className="ml-2 font-semibold text-ink-500">
                          {sh.speedClass === "express" ? "by bike" : "heavy — by truck"}
                        </span>
                      </p>
                      <StatusChip
                        tone={
                          sh.status === "delivered"
                            ? "ok"
                            : sh.status === "cancelled"
                              ? "bad"
                              : "warn"
                        }
                      >
                        {sh.status.replace(/_/g, " ")}
                      </StatusChip>
                    </div>

                    <ExpressRunBadge expressRun={sh.expressRun} />
                    <Row
                      label="Items"
                      value={`${sh.items.reduce((n, i) => n + i.qty, 0)} across ${sh.items.length} ${sh.items.length === 1 ? "line" : "lines"}`}
                    />
                    <Row label="From" value={sh.warehouse?.name ?? "unassigned"} />
                    <Row
                      label="Delivery code"
                      value={
                        sh.deliveryCode ?? (
                          <span className="text-ink-500">not issued yet</span>
                        )
                      }
                    />
                    <Row
                      label="Promised"
                      value={
                        sh.promisedAt ? (
                          new Date(sh.promisedAt).toLocaleString("en-IN")
                        ) : (
                          <span className="text-ink-500">
                            no slot — delivery windows do not exist yet
                          </span>
                        )
                      }
                    />
                    <Row
                      label="Driver & vehicle"
                      value={
                        sh.driver ? (
                          <span className="text-ink">
                            {sh.driver.name} · {sh.driver.phone}
                            {sh.vehicle ? ` · ${sh.vehicle.registration}` : " · own vehicle"}
                          </span>
                        ) : (
                          <span className="text-ink-500">
                            not assigned yet — assign from the dispatch board
                          </span>
                        )
                      }
                    />
                  </div>
                ))}
              </div>
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
            {secondCaptures.map((p) => (
              <Row
                key={p.id}
                label="Second capture"
                value={
                  <span className="tabular-nums">
                    {p.gatewayPaymentId ?? "—"} · {formatPaise(p.amountPaise)} ·{" "}
                    <StatusChip tone="bad">refund required</StatusChip>
                  </span>
                }
              />
            ))}
          </Panel>

          {/*
            The invoice panel from the artboard. Everything on it that is a
            number is real — the tax breakup is a per-line snapshot taken at
            order time, and place of supply follows from the delivery state.

            What is not real is the invoice itself. Nothing issues one: there
            is no invoice number, no sequence, no PDF and no credit note. So
            this says that, rather than showing a number in the shape of
            VE/26-27/00418 which somebody would then quote to their accountant.
          */}
          <Panel title="Invoice">
            <Row
              label="Status"
              value={<StatusChip tone="warn">Not issued</StatusChip>}
            />
            <Row label="Number" value="—" />
            <Row
              label="Place of supply"
              value={
                intraState
                  ? "Jammu & Kashmir (01) — intra-state"
                  : `${str("state") || "Outside J&K"} — inter-state`
              }
            />
            <p className="mt-1.5 text-[11px] font-semibold leading-[16px] text-ink-500">
              {intraState
                ? "Intra-state supply, so the tax splits CGST + SGST."
                : "Inter-state supply, so the tax is IGST."}{" "}
              No invoice is generated: there is no numbering sequence, no PDF and no
              credit note. Until a GSTIN is set in Settings, a document produced here
              would not be a tax invoice anyway.
            </p>
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
            <OrderExpressSelection expressFeePaise={order.expressFeePaise} shipments={order.shipments} />
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
