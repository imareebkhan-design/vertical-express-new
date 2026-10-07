"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Truck } from "lucide-react";
import { PlaceholderValue } from "@/components/ui/placeholder-value";
import type { OrderShipments } from "@/lib/services/shipments";

/**
 * Tracking — artboard 13b.
 *
 * One tab per shipment, because an order here routinely has two that behave
 * nothing alike: the wire left the store an hour ago, the cement is on
 * tomorrow's truck. A single status line cannot describe that, which is the
 * whole reason `Shipment` exists.
 *
 * WHAT IS REAL AND WHAT IS NOT
 *
 * The stage timeline, the promised time, the delivery code, the item counts and
 * now the driver all come from the Shipment row. The driver block carried a
 * placeholder for the whole life of this screen because there was no table
 * behind it; there is one now, so it shows the real name and vehicle once a
 * dispatcher assigns them, and says nobody is assigned yet when they have not.
 *
 * The batch code is still a placeholder and still has no model. That half of
 * this note was correct and stays — a code invented for a screenshot is exactly
 * the kind of thing that gets believed.
 *
 * The customer sees the driver's name and the registration, not their phone
 * number. Handing every customer a rider's mobile is the operator's decision to
 * make, not a side effect of showing who is coming.
 *
 * Live position is absent on purpose, not by oversight — GPS tracking is
 * deliberately deferred in DECISIONS.md, and the stage timeline is what the
 * design uses in its place.
 */
const STAGES = [
  { key: "pending", label: "Packed" },
  { key: "packed", label: "Dispatched" },
  { key: "out_for_delivery", label: "On the way" },
  { key: "delivered", label: "Delivered" },
] as const;

/** How far along the timeline a status sits. Cancelled short-circuits to -1. */
function stageIndex(status: string): number {
  if (status === "cancelled") return -1;
  const i = STAGES.findIndex((s) => s.key === status);
  return i < 0 ? 0 : i;
}

function timeOf(d: Date | string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function TrackingView({ order }: { order: OrderShipments }) {
  const [active, setActive] = useState(0);
  const shipments = order.shipments;
  const shipment = shipments[active];

  const addr = order.address as { label?: string; name?: string } | null;
  const siteName = addr?.name ?? addr?.label ?? "your site";

  if (!shipment) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center">
        <p className="text-[15px] font-bold text-ink">This order has no shipments yet.</p>
        <p className="mt-1.5 text-[13px] font-medium text-ink-700">
          It will appear here once it is packed.
        </p>
        <Link
          href={`/account/orders/${order.orderNo}`}
          className="mt-6 rounded-full bg-ink px-5 py-3 text-[14px] font-bold text-white no-underline"
        >
          Back to the order
        </Link>
      </div>
    );
  }

  const idx = stageIndex(shipment.status);
  const eta = timeOf(shipment.promisedAt);
  const itemCount = shipment.items.reduce((n, i) => n + i.qty, 0);

  return (
    <div className="min-h-screen bg-canvas pb-10">
      <div className="flex items-center gap-3 px-5 pt-3">
        <Link
          href={`/account/orders/${order.orderNo}`}
          aria-label="Back to the order"
          className="flex size-10 items-center justify-center rounded-full bg-paper shadow-card no-underline"
        >
          <ArrowLeft className="size-[18px] text-ink" aria-hidden />
        </Link>
        <div>
          <h1 className="text-[15px] font-extrabold text-ink">Order {order.orderNo}</h1>
          <p className="text-[12px] font-semibold text-ink-500">
            {siteName} · {shipments.length} shipment{shipments.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {shipments.length > 1 && (
        <div className="mt-4 flex gap-2 px-5">
          {shipments.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={i === active}
              className={
                "rounded-full px-3.5 py-2 text-[12px] font-bold " +
                (i === active ? "bg-ink text-white" : "bg-chip text-ink-700")
              }
            >
              Shipment {s.sequence}
            </button>
          ))}
        </div>
      )}

      <div className="px-5 pt-5">
        <div className="rounded-[24px] bg-paper p-5 shadow-card">
          <p className="text-[12px] font-bold uppercase tracking-[0.09em] text-ink-500">
            {shipment.status === "delivered" ? "Delivered" : "Arriving"}
          </p>
          <p className="mt-1 text-[26px] font-extrabold leading-8 tracking-[-0.025em] text-ink">
            {eta ? `by ${eta}` : <PlaceholderValue pending="slot windows are not set yet">To be scheduled</PlaceholderValue>}
          </p>
          {shipment.warehouse?.name && shipment.dispatchedAt && (
            <p className="mt-1.5 text-[13px] font-medium text-ink-700">
              Left {shipment.warehouse.name} at {timeOf(shipment.dispatchedAt)}.
            </p>
          )}

          {/* Stage timeline. Replaces live position, which is deferred. */}
          <ol className="mt-5 space-y-0">
            {STAGES.map((stage, i) => {
              const done = idx >= i;
              return (
                <li key={stage.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={
                        "flex size-6 flex-none items-center justify-center rounded-full " +
                        (done ? "bg-ink text-white" : "bg-chip text-transparent")
                      }
                      aria-hidden
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                    {i < STAGES.length - 1 && (
                      <span className={"w-[2px] flex-1 " + (idx > i ? "bg-ink" : "bg-chip")} />
                    )}
                  </div>
                  <p
                    className={
                      "pb-5 text-[14px] " +
                      (done ? "font-bold text-ink" : "font-medium text-ink-500")
                    }
                  >
                    {stage.label}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Delivery code — the one field on this screen that must not leak. */}
      {shipment.deliveryCode && (
        <div className="px-5 pt-3">
          <div className="rounded-[24px] bg-paper p-5 shadow-card">
            <p className="text-[12px] font-bold uppercase tracking-[0.09em] text-ink-500">
              Delivery code
            </p>
            <div className="mt-2.5 flex gap-2">
              {shipment.deliveryCode.split("").map((d, i) => (
                <span
                  key={i}
                  className="flex h-12 w-11 items-center justify-center rounded-[14px] bg-chip text-[22px] font-extrabold text-ink"
                >
                  {d}
                </span>
              ))}
            </div>
            <p className="mt-2.5 text-[12px] font-medium text-ink-700">
              Share it only when the material is at your gate.
            </p>
          </div>
        </div>
      )}

      <div className="px-5 pt-3">
        <div className="flex items-start gap-3 rounded-[24px] bg-paper p-5 shadow-card">
          <Truck className="mt-0.5 size-[18px] flex-none text-ink" strokeWidth={1.7} aria-hidden />
          <div>
            <p className="text-[14px] font-bold text-ink">
              {itemCount} item{itemCount !== 1 ? "s" : ""} in this shipment
            </p>
            <p className="mt-1 text-[13px] font-medium leading-[18px] text-ink-700">
              {shipment.driver ? (
                <>
                  {shipment.driver.name} is bringing it
                  {shipment.vehicle ? ` · ${shipment.vehicle.registration}` : ""}
                </>
              ) : (
                "Nobody is assigned to this shipment yet."
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
