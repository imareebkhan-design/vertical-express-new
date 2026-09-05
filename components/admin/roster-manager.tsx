"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminCreateDriver,
  adminCreateVehicle,
  adminSetDriverActive,
  adminSetVehicleActive,
} from "@/actions/roster";
import type { Roster } from "@/lib/services/admin/roster-write";

/**
 * The delivery roster.
 *
 * Retired rows stay on the list, greyed, because a driver who carried shipments
 * is referenced by every one of them — deleting the row would turn a delivered
 * order into one nobody took. Retiring removes them from the dispatch dropdown
 * and `assignShipment` refuses them; the history stays readable.
 */
export function RosterManager({ roster }: { roster: Roster }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [registration, setRegistration] = useState("");
  const [kind, setKind] = useState<"bike" | "van" | "truck">("bike");

  const field =
    "h-9 rounded-field border border-line bg-white px-2.5 text-[12.5px] font-semibold text-ink";
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

  return (
    <section className="rounded-panel bg-white p-4 shadow-card">
      <h2 className="text-[15px] font-bold tracking-tight text-ink">Roster</h2>
      <p className="mt-1 text-[12px] font-medium leading-[17px] text-ink-700">
        Who can carry a shipment, and what they drive. Retiring somebody keeps their
        deliveries readable and takes them out of the dispatch list.
      </p>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-500">
            Drivers
          </h3>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              aria-label="Driver name"
              className={`${field} min-w-0 flex-1`}
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone"
              inputMode="tel"
              aria-label="Driver phone"
              className={`${field} w-[130px]`}
            />
            <button
              type="button"
              disabled={pending || name.trim().length < 2 || phone.trim().length < 10}
              onClick={() =>
                run(async () => {
                  const res = await adminCreateDriver({ name, phone });
                  if (res.ok) {
                    setName("");
                    setPhone("");
                  }
                  return res;
                })
              }
              className={`${button} bg-ink text-white hover:bg-ink/90`}
            >
              Add
            </button>
          </div>

          {roster.drivers.length === 0 ? (
            <p className="mt-2 text-[12px] font-medium text-ops-warn">
              Nobody on the roster. A shipment cannot be dispatched until somebody is here
              to carry it.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {roster.drivers.map((d) => (
                <li
                  key={d.id}
                  className={`flex items-center justify-between gap-2 rounded-field px-3 py-2 ${
                    d.isActive ? "bg-canvas" : "bg-chip-soft opacity-60"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold text-ink">
                      {d.name}
                    </span>
                    <span className="block text-[11.5px] font-semibold tabular-nums text-ink-500">
                      {d.phone}
                      {d.isActive ? "" : " · retired"}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => adminSetDriverActive({ id: d.id, isActive: !d.isActive }))
                    }
                    className={`${button} shrink-0 bg-chip text-ink hover:bg-hush`}
                  >
                    {d.isActive ? "Retire" : "Reinstate"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-500">
            Vehicles
          </h3>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <input
              value={registration}
              onChange={(e) => setRegistration(e.target.value.toUpperCase())}
              placeholder="JK01AB1234"
              aria-label="Vehicle registration"
              className={`${field} min-w-0 flex-1 tabular-nums tracking-[0.04em]`}
            />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              aria-label="Vehicle kind"
              className={`${field} w-[92px]`}
            >
              <option value="bike">bike</option>
              <option value="van">van</option>
              <option value="truck">truck</option>
            </select>
            <button
              type="button"
              disabled={pending || registration.trim().length < 4}
              onClick={() =>
                run(async () => {
                  const res = await adminCreateVehicle({ registration, kind });
                  if (res.ok) setRegistration("");
                  return res;
                })
              }
              className={`${button} bg-ink text-white hover:bg-ink/90`}
            >
              Add
            </button>
          </div>

          {roster.vehicles.length === 0 ? (
            <p className="mt-2 text-[12px] font-medium text-ink-500">
              No vehicles. A driver on their own bike does not need one.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {roster.vehicles.map((v) => (
                <li
                  key={v.id}
                  className={`flex items-center justify-between gap-2 rounded-field px-3 py-2 ${
                    v.isActive ? "bg-canvas" : "bg-chip-soft opacity-60"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold tabular-nums text-ink">
                      {v.registration}
                    </span>
                    <span className="block text-[11.5px] font-semibold text-ink-500">
                      {v.kind}
                      {v.isActive ? "" : " · retired"}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => adminSetVehicleActive({ id: v.id, isActive: !v.isActive }))
                    }
                    className={`${button} shrink-0 bg-chip text-ink hover:bg-hush`}
                  >
                    {v.isActive ? "Retire" : "Reinstate"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-2.5 text-[11.5px] font-semibold text-ops-bad" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
