import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { adminOrderDetail } from "@/lib/services/admin/order-detail";
import { manualOrderMoves } from "@/lib/order-flow";
import { formatPaise } from "@/lib/money";
import { splitOrderPayments } from "@/lib/payment-rows";
import { formatIst } from "@/lib/ist";
import { FULFILMENT_STATES, PAYMENT_STATES } from "@/lib/admin-orders-query";
import { FULFILMENT_TONE, PAYMENT_TONE, fulfilmentState, paymentState, statusAheadOfShipments } from "@/lib/order-classify";
import { safeOrdersBack } from "@/lib/safe-orders-back";
import { StatusControl } from "@/components/admin/status-control";
import { OrderStatusChip, PaymentStatusChip, StatusChip } from "@/components/admin/status-chip";
import { getAdminUser } from "@/lib/services/admin/authz";
import { ExpressRunBadge, OrderExpressSelection } from "@/components/orders/express-selection";
import { ReturnIntake } from "@/components/admin/returns/return-intake";
import { RETURN_STATUS_LABEL } from "@/lib/return-flow";

export const dynamic = "force-dynamic";

const PAY_LABEL = Object.fromEntries(PAYMENT_STATES.map((p) => [p.key, p.label]));
const FUL_LABEL = Object.fromEntries(FULFILMENT_STATES.map((f) => [f.key, f.label]));
const SHIP_STEPS = ["pending", "packed", "out_for_delivery", "delivered"] as const;
const SHIP_LABEL: Record<string, string> = {
  pending: "To pack", packed: "Packed", out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled",
};

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-panel bg-white p-4 shadow-card" aria-label={title}>
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

const TONE_DOT: Record<string, string> = {
  ok: "bg-ops-ok", info: "bg-ops-info", warn: "bg-ops-warn", bad: "bg-ops-bad", neutral: "bg-ink-500",
};

export default async function AdminOrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ orderNo: string }>;
  searchParams: Promise<{ back?: string | string[] }>;
}) {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const { orderNo } = await params;
  const back = safeOrdersBack((await searchParams).back);
  const detail = await adminOrderDetail(orderNo);
  if (!detail) notFound();
  const { order, timeline, city, returns, returnable } = detail;

  const addr = (order.address ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof addr[k] === "string" ? (addr[k] as string) : "");
  const lat = typeof addr.latitude === "number" ? addr.latitude : null;
  const lng = typeof addr.longitude === "number" ? addr.longitude : null;
  /* Not the newest row: after a second capture (ISS-075) that is the
     refund-bound payment, and it would hide the one that paid for the order. */
  const { primary: payment, secondCaptures } = splitOrderPayments(order.payments);
  const pay = paymentState(order);
  const ful = fulfilmentState(order);
  const liveShipments = order.shipments.filter((s) => s.status !== "cancelled");
  const moves = manualOrderMoves(order.status, liveShipments.length > 0);
  const mismatch = statusAheadOfShipments(order);

  // GST is stored per line as a snapshot taken at order time. Orders placed
  // before per-line tax capture carry none, and say so.
  const hasTaxBreakup = order.items.some((i) => i.taxableValuePaise !== null);
  const cgst = order.items.reduce((s, i) => s + (i.cgstPaise ?? 0), 0);
  const sgst = order.items.reduce((s, i) => s + (i.sgstPaise ?? 0), 0);
  const igst = order.items.reduce((s, i) => s + (i.igstPaise ?? 0), 0);
  const taxable = order.items.reduce((s, i) => s + (i.taxableValuePaise ?? 0), 0);
  const intraState = igst === 0;
  const units = order.items.reduce((n, i) => n + i.qty, 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <Link href={back} className="grid size-9 place-items-center rounded-chip bg-chip transition-colors hover:bg-hush" aria-label="Back to orders">
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-extrabold tabular-nums tracking-tight">{order.orderNo}</h1>
            <StatusChip tone={PAYMENT_TONE[pay]}>{PAY_LABEL[pay]}</StatusChip>
            <StatusChip tone={FULFILMENT_TONE[ful]}>{FUL_LABEL[ful]}</StatusChip>
          </div>
          <p className="mt-0.5 text-[12px] font-semibold text-ink-500">
            Placed <time dateTime={order.placedAt.toISOString()}>{formatIst(order.placedAt)}</time>
            {" · "}order status <span className="text-ink">{order.status.replace(/_/g, " ")}</span>
          </p>
        </div>
        <span className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          {liveShipments.some((s) => s.status !== "delivered") && (
            <Link href="/admin/dispatch" className="inline-flex h-9 items-center rounded-panel bg-ink px-4 text-[12.5px] font-bold text-white">
              Open dispatch board
            </Link>
          )}
          <Link href="/admin/payments" className="inline-flex h-9 items-center rounded-panel bg-chip px-4 text-[12.5px] font-bold text-ink">
            Payments
          </Link>
          {moves.length > 0 && <StatusControl kind="order" id={order.id} options={moves} />}
        </div>
      </div>

      {mismatch && (
        <p role="note" className="rounded-[12px] bg-ops-warn-tint px-3.5 py-3 text-[12.5px] font-semibold leading-[18px] text-ops-warn">
          {mismatch} The fulfilment badge follows the shipments. The status was moved by hand (see the timeline); it is
          left as recorded. Packing the shipment on the dispatch board brings the two back in line.
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title={`Items · ${units} ${units === 1 ? "unit" : "units"}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
                    <th className="px-2 pb-2.5">Item</th>
                    <th className="px-2 pb-2.5">HSN / GST</th>
                    <th className="px-2 pb-2.5 text-right">Qty</th>
                    <th className="px-2 pb-2.5 text-right">Unit price</th>
                    <th className="px-2 pb-2.5 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.id} className="border-t border-line">
                      <td className="px-2 py-2.5">
                        <p className="text-[12.5px] font-bold">{i.title}</p>
                        <p className="text-[11px] font-semibold text-ink-500">
                          {i.variantName}{i.variant?.sku ? ` · SKU ${i.variant.sku}` : ""}
                        </p>
                      </td>
                      <td className="px-2 py-2.5 text-[11px] font-semibold tabular-nums text-ink-500">
                        {i.hsnCode ?? "—"}
                        <span className="block">{i.gstRate !== null ? `${String(i.gstRate)}%` : "not recorded"}</span>
                      </td>
                      <td className="px-2 py-2.5 text-right text-[12.5px] font-bold tabular-nums">{i.qty}</td>
                      <td className="px-2 py-2.5 text-right text-[12px] font-semibold tabular-nums">{formatPaise(i.unitPricePaise)}</td>
                      <td className="px-2 py-2.5 text-right text-[12.5px] font-bold tabular-nums">{formatPaise(i.totalPaise ?? i.lineTotalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] font-semibold text-ink-500">Prices are the snapshot taken when the order was placed.</p>
          </Panel>

          <Panel title="Payment" right={<StatusChip tone={PAYMENT_TONE[pay]}>{PAY_LABEL[pay]}</StatusChip>}>
            {hasTaxBreakup ? (
              <>
                <Row label="Taxable value" value={formatPaise(taxable)} />
                {igst > 0 ? (
                  <Row label="IGST (inter-state)" value={formatPaise(igst)} />
                ) : (
                  <>
                    <Row label="CGST" value={formatPaise(cgst)} />
                    <Row label="SGST" value={formatPaise(sgst)} />
                  </>
                )}
              </>
            ) : (
              <Row label="Tax breakup" value={<StatusChip tone="warn">Not recorded</StatusChip>} />
            )}
            {order.discountPaise > 0 && (
              <Row label={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`} value={`− ${formatPaise(order.discountPaise)}`} />
            )}
            <Row label="Delivery" value={order.deliveryFeePaise === 0 ? "Free" : formatPaise(order.deliveryFeePaise)} />
            <OrderExpressSelection expressFeePaise={order.expressFeePaise} shipments={order.shipments} />
            <div className="my-2 h-px bg-line" />
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold">Total</span>
              <span className="text-lg font-extrabold tabular-nums">{formatPaise(order.totalPaise)}</span>
            </div>

            <h3 className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.09em] text-ink-500">Transactions</h3>
            {order.payments.length === 0 ? (
              <p className="mt-1.5 text-[12px] font-semibold text-ink-500">
                {order.paymentMethod === "cod" ? "Cash on delivery — no online transaction." : "No payment recorded."}
              </p>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-2">
                {order.payments.map((p) => (
                  <li key={p.id} className="rounded-[12px] bg-canvas p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12.5px] font-bold">
                        {p.gateway === "razorpay" ? "Razorpay" : p.gateway} · {formatPaise(p.amountPaise)}
                        {p.id === payment?.id && secondCaptures.length > 0 ? " · original" : ""}
                      </p>
                      <PaymentStatusChip status={p.status} />
                    </div>
                    <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
                      Started {formatIst(p.createdAt)} · last update {formatIst(p.updatedAt)}
                    </p>
                    {p.gatewayPaymentId && <p className="text-[11px] font-semibold tabular-nums text-ink-500">Payment ref {p.gatewayPaymentId}</p>}
                    {p.gatewayOrderId && <p className="text-[11px] font-semibold tabular-nums text-ink-500">Gateway order {p.gatewayOrderId}</p>}
                    <p className="text-[11px] font-semibold text-ink-500">Signature {p.signatureVerified ? "verified" : "not verified"}</p>
                    {secondCaptures.some((s) => s.id === p.id) && <StatusChip tone="bad">Second capture — refund required</StatusChip>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] font-semibold text-ink-500">
              Payment status is set only by Razorpay (verified signature or webhook) — never by hand.
            </p>
          </Panel>

          <Panel title={`Shipments${liveShipments.length > 1 ? ` · ${liveShipments.length}` : ""}`} right={<StatusChip tone={FULFILMENT_TONE[ful]}>{FUL_LABEL[ful]}</StatusChip>}>
            {order.shipments.length === 0 ? (
              <p className="text-[12px] font-semibold text-ink-500">
                No shipments recorded. Orders placed before the shipment split shipped as one delivery.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {order.shipments.map((sh) => {
                  const at = SHIP_STEPS.indexOf(sh.status as (typeof SHIP_STEPS)[number]);
                  return (
                    <div key={sh.id} className="rounded-[12px] bg-canvas p-3" aria-label={`Shipment ${sh.sequence}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[13px] font-bold text-ink">
                          Shipment {sh.sequence}
                          <span className="ml-2 font-semibold text-ink-500">{sh.speedClass === "express" ? "by bike" : "heavy — by truck"}</span>
                        </p>
                        <StatusChip tone={sh.status === "delivered" ? "ok" : sh.status === "cancelled" ? "bad" : "warn"}>{SHIP_LABEL[sh.status] ?? sh.status}</StatusChip>
                      </div>
                      {sh.status !== "cancelled" && (
                        <ol className="mt-2.5 grid grid-cols-4 gap-1" aria-label="Progress">
                          {SHIP_STEPS.map((s, i) => (
                            <li key={s} className="flex flex-col gap-1">
                              <span className={`h-1.5 rounded-full ${i <= at ? "bg-ink" : "bg-line"}`} />
                              <span className={`text-[10.5px] font-semibold ${i <= at ? "text-ink" : "text-ink-500"}`}>{SHIP_LABEL[s]}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                      <ExpressRunBadge expressRun={sh.expressRun} />
                      <Row label="Items" value={sh.items.map((i) => `${i.qty} × ${i.orderItem.title}`).join(", ") || "—"} />
                      <Row label="From" value={sh.warehouse?.name ?? "unassigned"} />
                      <Row
                        label="Driver & vehicle"
                        value={
                          sh.driver ? (
                            <span>{sh.driver.name} · {sh.driver.phone}{sh.vehicle ? ` · ${sh.vehicle.registration}` : " · own vehicle"}</span>
                          ) : (
                            <span className="text-ink-500">not assigned — assign on the dispatch board</span>
                          )
                        }
                      />
                      {sh.dispatchedAt && <Row label="Dispatched" value={formatIst(sh.dispatchedAt)} />}
                      {sh.deliveredAt && <Row label="Delivered" value={formatIst(sh.deliveredAt)} />}
                      <Row
                        label="Delivery code"
                        value={
                          sh.deliveryCode ? (
                            /* Admin-only screen, for support verifying the customer — never
                               for the driver, who must hear it from the customer at the gate. */
                            <span>{sh.deliveryCode} <span className="text-[11px] font-semibold text-ops-warn">customer only — never tell the driver</span></span>
                          ) : (
                            <span className="text-ink-500">{sh.status === "delivered" ? "used" : "issued at dispatch"}</span>
                          )
                        }
                      />
                      {sh.liveLocation && sh.status === "out_for_delivery" && (
                        <Row
                          label="Driver's last position"
                          value={
                            <a
                              className="underline"
                              target="_blank"
                              rel="noreferrer"
                              href={`https://www.google.com/maps/search/?api=1&query=${sh.liveLocation.latitude},${sh.liveLocation.longitude}`}
                            >
                              {formatIst(sh.liveLocation.recordedAt)} · open map
                            </a>
                          }
                        />
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link href={`/admin/shipments/${sh.id}/packing-slip`} className="inline-flex h-8 items-center rounded-full bg-white px-3.5 text-[12px] font-bold text-ink">
                          Packing slip
                        </Link>
                        {sh.status !== "delivered" && sh.status !== "cancelled" && (
                          <Link href="/admin/dispatch" className="inline-flex h-8 items-center rounded-full bg-white px-3.5 text-[12px] font-bold text-ink">
                            {sh.status === "pending" ? "Pack on dispatch board" : sh.status === "packed" ? "Assign & dispatch" : "Track on dispatch board"}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title={`Returns${returns.length ? ` · ${returns.length}` : ""}`}>
            {returns.length > 0 && (
              <ul className="mb-3 flex flex-col gap-2">
                {returns.map((r) => (
                  <li key={r.returnNo} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-canvas p-3">
                    <Link href={`/admin/returns/${r.returnNo}`} className="text-[12.5px] font-bold underline-offset-2 hover:underline">
                      {r.returnNo}
                    </Link>
                    <span className="text-[11.5px] font-semibold text-ink-500">
                      {r.items.map((i) => `${i.qty} × ${i.orderItem.title}`).join(", ")} · asked {formatIst(r.requestedAt)}
                    </span>
                    <StatusChip tone={r.status === "rejected" ? "bad" : r.status === "approved" ? "ok" : "info"}>{RETURN_STATUS_LABEL[r.status]}</StatusChip>
                  </li>
                ))}
              </ul>
            )}
            <ReturnIntake orderNo={order.orderNo} lines={returnable} />
          </Panel>

          <Panel title="Timeline">
            <ol className="flex flex-col gap-3" aria-label="Order activity">
              {timeline.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className={`mt-1.5 size-2 flex-none rounded-full ${TONE_DOT[e.tone]}`} aria-hidden />
                  <div>
                    <p className="text-[12.5px] font-bold">{e.title}</p>
                    <p className="text-[11px] font-semibold text-ink-500">
                      <time dateTime={e.at.toISOString()}>{formatIst(e.at)}</time>
                      {e.detail ? ` · ${e.detail}` : ""}
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
            <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-ink-700">{str("phone") || order.user?.phone || "—"}</p>
            {order.user?.phone && order.user.phone !== str("phone") && (
              <p className="text-[11px] font-semibold text-ink-500">Account mobile {order.user.phone}</p>
            )}
            {order.user?.email && <p className="text-[11px] font-semibold text-ink-500">{order.user.email}</p>}
          </Panel>

          <Panel title="Delivery address">
            <p className="text-[12.5px] font-semibold leading-relaxed">
              {[str("line1"), str("line2"), str("landmark")].filter(Boolean).join(", ")}
              <br />
              {[str("city"), str("state")].filter(Boolean).join(", ")} <span className="tabular-nums">{str("pincode")}</span>
            </p>
            {str("accessNote") && <p className="mt-2 text-[11.5px] font-semibold text-ink-700">Access: {str("accessNote")}</p>}
            <Row label="Service city" value={city ? `${city.name}${city.isLive ? "" : " (off)"}` : "not a served pincode"} />
            <Row
              label="Map pin"
              value={
                lat !== null && lng !== null ? (
                  <a className="underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}>
                    {lat.toFixed(5)}, {lng.toFixed(5)}
                  </a>
                ) : (
                  <span className="text-ops-warn">no pin — driver navigates by address text</span>
                )
              }
            />
            <Row label="Warehouse" value={order.warehouse?.name ?? "—"} />
          </Panel>

          {order.notes && (
            <Panel title="Notes">
              <p className="text-[12px] font-semibold leading-relaxed text-ink-700">{order.notes}</p>
            </Panel>
          )}

          {/*
            Everything here that is a number is real — the per-line tax snapshot.
            What is not real is the invoice itself: nothing issues one (no
            number, no sequence, no PDF, no credit note), so this says so rather
            than showing a number in the shape of an invoice.
          */}
          <Panel title="Invoice">
            <Row label="Status" value={<StatusChip tone="warn">Not issued</StatusChip>} />
            <Row
              label="Place of supply"
              value={intraState ? "Jammu & Kashmir (01) — intra-state" : `${city?.state ?? (str("state") || "Outside J&K")} — inter-state`}
            />
            <p className="mt-1.5 text-[11px] font-semibold leading-[16px] text-ink-500">
              {intraState ? "Tax split CGST + SGST." : "Tax charged as IGST."} No invoice is generated yet: there is no numbering
              sequence, PDF or credit note.
            </p>
          </Panel>

          <Panel title="Order status">
            <OrderStatusChip status={order.status} />
            <p className="mt-2 text-[11px] font-semibold leading-[16px] text-ink-500">
              {liveShipments.length > 0
                ? "Follows the shipments: packing, dispatch and delivery happen on the dispatch board, where delivery needs the customer's code."
                : "This order has no shipments, so its status is moved by hand."}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
