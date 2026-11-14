"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { RosterDetailed } from "@/lib/services/admin/roster-write";
import type { ActionResult } from "@/lib/validators";

export interface HistoryEntry { label: string; at: string; note: string | null }

type Act = (input: unknown) => Promise<ActionResult<null>>;
export interface RosterActions {
  createDriver: Act;
  updateDriver: Act;
  setDriverActive: Act;
  releaseDriverLogin: Act;
  createVehicle: Act;
  setVehicleActive: Act;
}

const field = "h-10 w-full rounded-field border border-line bg-white px-3 text-[13px] font-semibold text-ink";
const btn = "h-10 rounded-full px-4 text-[12.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${btn} bg-ink text-white hover:bg-ink-700`;
const quiet = `${btn} bg-chip text-ink hover:bg-hush`;
const badge = "rounded-full px-2.5 py-1 text-[11px] font-bold";
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

/**
 * The Drivers & vehicles screen. Actions are props so the screen renders in
 * component tests; `drivers-manager.tsx` binds the real server actions.
 */
export function DriversManagerView({
  roster,
  history,
  actions,
  onDone,
}: {
  roster: RosterDetailed;
  history: Record<string, HistoryEntry[]>;
  actions: RosterActions;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (fn: () => Promise<ActionResult<null>>, success: string) => {
    setMessage(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMessage({ ok: true, text: success });
        onDone();
      } else setMessage({ ok: false, text: res.error.message });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`rounded-panel px-3.5 py-2.5 text-[12.5px] font-bold ${message.ok ? "bg-ops-ok-tint text-ops-ok" : "bg-ops-bad-tint text-ops-bad"}`}>
          {message.text}
        </p>
      )}

      <section aria-labelledby="drivers-h" className="rounded-panel bg-white p-4 shadow-card">
        <h2 id="drivers-h" className="text-[15px] font-bold tracking-tight">Drivers</h2>
        <AddDriver pending={pending} onAdd={(name, phone) => run(() => actions.createDriver({ name, phone }), `${name} added. They can now sign in to the app with that number.`)} />
        {roster.drivers.length === 0 ? (
          <p className="mt-4 rounded-panel bg-hush px-3.5 py-3 text-[12.5px] font-semibold text-ink-700">
            No drivers yet. Add the first one above.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 lg:grid-cols-2">
            {roster.drivers.map((d) => (
              <DriverCard key={d.id} d={d} history={history[d.id] ?? []} pending={pending} run={run} actions={actions} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="vehicles-h" className="rounded-panel bg-white p-4 shadow-card">
        <h2 id="vehicles-h" className="text-[15px] font-bold tracking-tight">Vehicles</h2>
        <AddVehicle pending={pending} onAdd={(registration, kind) => run(() => actions.createVehicle({ registration, kind }), `${registration.toUpperCase()} added.`)} />
        {roster.vehicles.length === 0 ? (
          <p className="mt-4 rounded-panel bg-hush px-3.5 py-3 text-[12.5px] font-semibold text-ink-700">
            No vehicles yet. A vehicle is optional — a rider on their own bike can deliver without one.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roster.vehicles.map((v) => (
              <li key={v.id} className={`rounded-panel border border-line p-3.5 ${v.isActive ? "" : "opacity-60"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px] font-extrabold tracking-wide">{v.registration}</p>
                  <span className={`${badge} ${v.isActive ? "bg-ops-ok-tint text-ops-ok" : "bg-hush text-ink-500"}`}>{v.isActive ? "Active" : "Retired"}</span>
                </div>
                <p className="mt-1 text-[12px] font-semibold capitalize text-ink-500">
                  {v.kind} · {v.activeShipments ? `${v.activeShipments} delivery in progress` : "not on a delivery"}
                </p>
                <button
                  type="button"
                  className={`${quiet} mt-3`}
                  disabled={pending}
                  onClick={() => {
                    if (v.isActive && !window.confirm(`Retire ${v.registration}? It stays in past deliveries and can be reinstated.`)) return;
                    run(() => actions.setVehicleActive({ id: v.id, isActive: !v.isActive }), `${v.registration} ${v.isActive ? "retired" : "reinstated"}.`);
                  }}
                >
                  {v.isActive ? "Retire" : "Reinstate"}
                </button>
                <History entries={history[v.id] ?? []} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddDriver({ pending, onAdd }: { pending: boolean; onAdd: (name: string, phone: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <form
      aria-label="Add a driver"
      className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name.trim(), phone.trim());
        setName("");
        setPhone("");
      }}
    >
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">Driver name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} className={field} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">Mobile number</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="10-digit mobile" className={field} />
      </label>
      <button type="submit" className={`${primary} self-end`} disabled={pending || name.trim().length < 2 || phone.replace(/\D/g, "").length < 10}>
        Add driver
      </button>
    </form>
  );
}

function AddVehicle({ pending, onAdd }: { pending: boolean; onAdd: (registration: string, kind: "bike" | "van" | "truck") => void }) {
  const [registration, setRegistration] = useState("");
  const [kind, setKind] = useState<"bike" | "van" | "truck">("bike");
  return (
    <form
      aria-label="Add a vehicle"
      className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(registration.trim(), kind);
        setRegistration("");
      }}
    >
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">Registration number</span>
        <input value={registration} onChange={(e) => setRegistration(e.target.value)} required minLength={4} maxLength={20} placeholder="JK01AB1234" className={`${field} uppercase`} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">Type</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as "bike" | "van" | "truck")} className={field}>
          <option value="bike">Bike</option>
          <option value="van">Van</option>
          <option value="truck">Truck</option>
        </select>
      </label>
      <button type="submit" className={`${primary} self-end`} disabled={pending || registration.trim().length < 4}>
        Add vehicle
      </button>
    </form>
  );
}

function DriverCard({
  d,
  history,
  pending,
  run,
  actions,
}: {
  d: RosterDetailed["drivers"][number];
  history: HistoryEntry[];
  pending: boolean;
  run: (fn: () => Promise<ActionResult<null>>, success: string) => void;
  actions: RosterActions;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.name);
  const [phone, setPhone] = useState(d.phone);
  const onRoad = d.shipments.some((s) => s.status === "out_for_delivery");

  return (
    <li className={`rounded-panel border border-line p-3.5 ${d.isActive ? "" : "opacity-60"}`} aria-label={`Driver ${d.name}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-extrabold">{d.name}</p>
          <p className="text-[12.5px] font-semibold text-ink-500">{d.phone}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={`${badge} ${d.isActive ? "bg-ops-ok-tint text-ops-ok" : "bg-hush text-ink-500"}`}>{d.isActive ? "Active" : "Retired"}</span>
          <span className={`${badge} ${d.appLinked ? "bg-ops-ok-tint text-ops-ok" : "bg-ops-warn-tint text-ops-warn"}`}>
            {d.appLinked ? "Signed in to app" : "Not signed in yet"}
          </span>
        </div>
      </div>

      <p className="mt-2 text-[12px] font-semibold text-ink-700">
        {d.shipments.length === 0 ? "No deliveries assigned" : `${d.shipments.length} assigned:`}{" "}
        {d.shipments.map((s, i) => (
          <span key={s.id}>
            {i > 0 && ", "}
            <Link href={`/admin/orders/${s.order.orderNo}`} className="font-bold underline underline-offset-2">{s.order.orderNo}</Link>
            {s.status === "out_for_delivery" ? " (on the road)" : " (packed)"}
          </span>
        ))}
        {" · "}
        {d.deliveredCount} delivered · added {when(d.createdAt.toString())}
      </p>

      {editing ? (
        <form
          aria-label={`Edit ${d.name}`}
          className="mt-3 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => actions.updateDriver({ id: d.id, name: name.trim(), phone: phone.trim() }), "Driver details saved.");
            setEditing(false);
          }}
        >
          <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} className={`${field} mt-1`} />
          </label>
          <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
            Mobile number{d.appLinked ? " (locked — signed in to the app)" : ""}
            <input value={phone} onChange={(e) => setPhone(e.target.value)} readOnly={d.appLinked} inputMode="tel" className={`${field} mt-1 ${d.appLinked ? "bg-hush" : ""}`} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={primary} disabled={pending}>Save</button>
            <button type="button" className={quiet} onClick={() => { setEditing(false); setName(d.name); setPhone(d.phone); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={quiet} disabled={pending} onClick={() => setEditing(true)}>Edit</button>
          <button
            type="button"
            className={quiet}
            disabled={pending}
            onClick={() => {
              if (d.isActive && !window.confirm(`Retire ${d.name}? They lose access to driver mode immediately; their past deliveries stay on record.`)) return;
              run(() => actions.setDriverActive({ id: d.id, isActive: !d.isActive }), `${d.name} ${d.isActive ? "retired" : "reinstated"}.`);
            }}
          >
            {d.isActive ? "Retire" : "Reinstate"}
          </button>
          {d.appLinked && (
            <button
              type="button"
              className={quiet}
              disabled={pending || onRoad}
              title={onRoad ? "Not while they are out on a delivery" : undefined}
              onClick={() => {
                const reason = window.prompt(`Release ${d.name}'s app login? Their next sign-in with ${d.phone} links afresh. Why? (e.g. phone lost)`);
                if (reason === null) return;
                run(() => actions.releaseDriverLogin({ id: d.id, reason }), `${d.name}'s app login released.`);
              }}
            >
              Release app login
            </button>
          )}
        </div>
      )}
      <History entries={history} />
    </li>
  );
}

function History({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[11.5px] font-bold text-ink-500">History ({entries.length})</summary>
      <ul className="mt-1.5 grid gap-1 text-[11.5px] font-medium text-ink-700">
        {entries.map((h, i) => (
          <li key={i}>{when(h.at)} — {h.label}{h.note ? `: ${h.note}` : ""}</li>
        ))}
      </ul>
    </details>
  );
}
