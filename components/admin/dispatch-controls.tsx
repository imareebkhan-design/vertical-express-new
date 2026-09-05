"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminAdvanceShipment, adminAssignShipment } from "@/actions/dispatch";
import type { DispatchShipment, DispatchRoster } from "@/lib/services/shipments";

/**
 * The controls that move one shipment.
 *
 * `Shipment` was write-once for its whole life (ISS-009) — this is the first
 * place a dispatcher can act on one. Every rule about what may move where lives
 * in the service; this component only offers the moves and reports what came
 * back.
 *
 * The handover code is shown once, right after dispatch, and never again. It is
 * read to the driver and belongs to the customer's gate — it is deliberately
 * not stored on this screen, not in the audit trail, and not re-fetchable. A
 * dispatcher who misses it has to look at the shipment record, which is the
 * correct amount of friction for a credential.
 */
export function DispatchControls({
  shipment,
  roster,
}: {
  shipment: DispatchShipment;
  roster: DispatchRoster;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [driverId, setDriverId] = useState(shipment.driver?.id ?? "");
  const [vehicleId, setVehicleId] = useState(shipment.vehicle?.id ?? "");

  const field =
    "h-9 w-full rounded-field border border-line bg-white px-2.5 text-[12.5px] font-semibold text-ink";
  const button =
    "h-9 rounded-full px-3.5 text-[12px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error?.message ?? "That did not work");
      else router.refresh();
    });
  };

  const assign = () =>
    run(async () => {
      const res = await adminAssignShipment({ shipmentId: shipment.id, driverId, vehicleId });
      return res;
    });

  const advance = (to: "packed" | "out_for_delivery" | "delivered" | "cancelled") =>
    run(async () => {
      const res = await adminAdvanceShipment({ shipmentId: shipment.id, to });
      if (res.ok && res.data.deliveryCode) setCode(res.data.deliveryCode);
      return res;
    });

  return (
    <div className="mt-3 border-t border-line pt-3">
      {shipment.driver ? (
        <p className="text-[11.5px] font-semibold text-ink-700">
          {shipment.driver.name}
          {shipment.vehicle ? ` · ${shipment.vehicle.registration}` : " · own vehicle"}
        </p>
      ) : (
        <p className="text-[11.5px] font-semibold text-ops-warn">Nobody assigned yet</p>
      )}

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <select
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          aria-label={`Driver for ${shipment.ref}`}
          className={field}
        >
          <option value="">Driver…</option>
          {roster.drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          aria-label={`Vehicle for ${shipment.ref}`}
          className={field}
        >
          {/* Optional — a rider on their own bike is a real case here. */}
          <option value="">No vehicle</option>
          {roster.vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.registration} · {v.kind}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={assign}
          disabled={pending || !driverId}
          className={`${button} bg-chip text-ink hover:bg-hush`}
        >
          Assign
        </button>

        {shipment.status === "pending" && (
          <button
            type="button"
            onClick={() => advance("packed")}
            disabled={pending}
            className={`${button} bg-ink text-white hover:bg-ink/90`}
          >
            Mark packed
          </button>
        )}

        {shipment.status === "packed" && (
          <button
            type="button"
            onClick={() => advance("out_for_delivery")}
            disabled={pending}
            className={`${button} bg-ink text-white hover:bg-ink/90`}
          >
            Dispatch
          </button>
        )}

        <button
          type="button"
          onClick={() => advance("cancelled")}
          disabled={pending}
          className={`${button} bg-ops-bad-tint text-ops-bad`}
        >
          Cancel
        </button>
      </div>

      {code && (
        <div className="mt-2.5 rounded-field bg-ops-ok-tint p-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ops-ok">
            Read this to the driver
          </p>
          <p className="mt-0.5 text-[20px] font-extrabold tabular-nums tracking-[0.12em] text-ops-ok">
            {code}
          </p>
          <p className="mt-1 text-[11px] font-medium leading-[15px] text-ops-ok">
            Shown once. The customer reads it back at the gate to confirm the handover.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-2 text-[11.5px] font-semibold text-ops-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
