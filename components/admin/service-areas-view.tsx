"use client";

import { useState, useTransition } from "react";
import { CSV_TEMPLATE } from "@/lib/serviceability-csv";
import { formatPaise } from "@/lib/money";
import { StatusChip } from "@/components/admin/status-chip";
import type { ActionResult } from "@/lib/validators";

/**
 * Where we deliver, by city.
 *
 * A city is switched Live or Off as a whole — Off stops every pincode in it at
 * once and keeps the list and terms, so going live again restores exactly what
 * was there. Inside a city each pincode is included or excluded on its own.
 * A new city starts Off: adding Delhi and its pincodes promises nobody
 * anything until someone presses Go live.
 *
 * Actions come in as props so the screen is tested without a server.
 */
export interface AreaPincode {
  pincode: string;
  area: string | null;
  warehouseId: string;
  warehouseName: string;
  etaMinutes: number;
  deliveryFeePaise: number;
  codAllowed: boolean;
  isActive: boolean;
}

export interface AreaCity {
  id: string;
  name: string;
  state: string;
  isLive: boolean;
  included: number;
  excluded: number;
  pincodes: AreaPincode[];
}

type Bulk = { created: number; updated: number; unchanged: number };

export interface ServiceAreaActions {
  createCity: (i: { name: string; state: string }) => Promise<ActionResult<{ id: string }>>;
  setCityLive: (i: { cityId: string; isLive: boolean }) => Promise<ActionResult<null>>;
  includePincodes: (i: {
    cityId: string;
    pincodes: string;
    warehouseId: string;
    area: string;
    etaMinutes: string;
    deliveryFee: string;
    codAllowed: boolean;
  }) => Promise<ActionResult<Bulk & { skippedExcluded?: string[] }>>;
  setPincodeIncluded: (i: { pincode: string; isActive: boolean }) => Promise<ActionResult<null>>;
  savePincode: (i: {
    pincode: string;
    cityId: string;
    area: string;
    warehouseId: string;
    etaMinutes: string;
    deliveryFee: string;
    codAllowed: boolean;
    isActive: boolean;
  }) => Promise<ActionResult<null>>;
  importCsv: (csv: string, cityId: string) => Promise<ActionResult<Bulk>>;
}

const field =
  "h-10 w-full rounded-field bg-chip-soft px-3.5 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";

const bulkText = (b: Bulk & { skippedExcluded?: string[] }) =>
  `${b.created} added, ${b.updated} changed, ${b.unchanged} already correct.` +
  (b.skippedExcluded?.length ? ` Left excluded: ${b.skippedExcluded.join(", ")} — use Include on its row to re-include.` : "");

export function ServiceAreasView({
  cities,
  warehouses,
  codGloballyOff,
  actions,
  onDone,
  initialCityId,
}: {
  cities: AreaCity[];
  warehouses: { id: string; name: string }[];
  codGloballyOff: boolean;
  actions: ServiceAreaActions;
  onDone: () => void;
  initialCityId?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialCityId ?? cities[0]?.id ?? null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [addingCity, setAddingCity] = useState(false);
  const [cityDraft, setCityDraft] = useState({ name: "", state: "" });
  const [include, setInclude] = useState({
    pincodes: "",
    area: "",
    warehouseId: warehouses[0]?.id ?? "",
    etaMinutes: "",
    deliveryFee: "",
    codAllowed: false,
  });
  const [editing, setEditing] = useState<(AreaPincode & { eta: string; fee: string; areaText: string }) | null>(null);

  const city = cities.find((c) => c.id === selectedId) ?? null;

  const run = <T,>(p: Promise<ActionResult<T>>, ok: (v: T) => string, after?: () => void) => {
    setMessage(null);
    start(async () => {
      const r = await p;
      if (r.ok) {
        setMessage({ ok: true, text: ok(r.data) });
        after?.();
        onDone();
      } else setMessage({ ok: false, text: r.error.message });
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Cities */}
      <section className="rounded-panel bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold tracking-tight">Cities</h2>
          <button
            type="button"
            onClick={() => setAddingCity((v) => !v)}
            className="h-9 rounded-panel bg-chip px-4 text-[12.5px] font-bold text-ink"
          >
            {addingCity ? "Cancel" : "Add a city"}
          </button>
        </div>

        {addingCity && (
          <div className="mt-3 grid gap-3 rounded-field bg-chip-soft p-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field label="City">
              <input
                aria-label="City name"
                value={cityDraft.name}
                onChange={(e) => setCityDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Delhi"
                className={field + " bg-white"}
              />
            </Field>
            <Field label="State" hint="Decides GST: outside Jammu & Kashmir is IGST.">
              <input
                aria-label="State"
                value={cityDraft.state}
                onChange={(e) => setCityDraft((d) => ({ ...d, state: e.target.value }))}
                placeholder="Delhi"
                className={field + " bg-white"}
              />
            </Field>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(actions.createCity(cityDraft), () => `${cityDraft.name} added — it is Off until you go live.`, () => {
                  setAddingCity(false);
                  setCityDraft({ name: "", state: "" });
                })
              }
              className="h-10 self-start rounded-panel bg-ink px-5 text-[13px] font-bold text-white disabled:opacity-50 sm:mt-[18px]"
            >
              Add city
            </button>
          </div>
        )}

        {cities.length === 0 ? (
          <p className="mt-3 text-[12.5px] font-semibold text-ink-500">No cities yet. Checkout will reject every address.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cities.map((c) => (
              <li key={c.id}>
                <div
                  className={
                    "flex items-center gap-3 rounded-field px-3 py-2.5 " +
                    (c.id === selectedId ? "bg-ink text-white" : "bg-canvas")
                  }
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(c.id);
                      setEditing(null);
                      setMessage(null);
                    }}
                    className="min-w-0 flex-1 text-left"
                    aria-pressed={c.id === selectedId}
                    aria-label={`Open ${c.name}`}
                  >
                    <p className="truncate text-[13px] font-bold">{c.name}</p>
                    <p className={"text-[11px] font-semibold " + (c.id === selectedId ? "text-white/70" : "text-ink-500")}>
                      {c.state} · {c.included} included{c.excluded > 0 ? ` · ${c.excluded} excluded` : ""}
                    </p>
                  </button>
                  <StatusChip tone={c.isLive ? "ok" : "neutral"}>{c.isLive ? "Live" : "Off"}</StatusChip>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && (
        <p
          role="status"
          className={"whitespace-pre-line text-[12.5px] font-semibold " + (message.ok ? "text-ink" : "text-ops-bad")}
        >
          {message.text}
        </p>
      )}

      {codGloballyOff && (
        <p className="rounded-panel bg-ops-info-tint p-3.5 text-[12px] font-medium leading-[17px] text-ops-info">
          Cash on delivery is switched off for the whole shop in Settings. Allowing it on a pincode here will not offer
          it at checkout until that is turned on.
        </p>
      )}

      {city && (
        <section className="rounded-panel bg-white p-4 shadow-card" aria-label={`${city.name} service area`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-extrabold tracking-tight">{city.name}</h2>
              <p className="mt-0.5 text-[12px] font-semibold text-ink-500">
                {city.isLive
                  ? `Live — delivering to ${city.included} ${city.included === 1 ? "pincode" : "pincodes"}.`
                  : "Off — no pincode here is sold to, whatever its own setting."}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const goLive = !city.isLive;
                if (!goLive && !window.confirm(`Stop delivering in ${city.name}? Checkout will refuse every address there.`)) return;
                run(actions.setCityLive({ cityId: city.id, isLive: goLive }), () =>
                  goLive ? `${city.name} is live.` : `${city.name} is off. Its pincodes are kept.`
                );
              }}
              className={
                "h-10 rounded-panel px-5 text-[13px] font-bold disabled:opacity-50 " +
                (city.isLive ? "bg-chip text-ink" : "bg-ink text-white")
              }
            >
              {city.isLive ? "Switch off" : "Go live"}
            </button>
          </div>

          {/* Include pincodes */}
          <div className="mt-4 rounded-field bg-chip-soft p-3">
            <p className="text-[13px] font-bold text-ink">Include pincodes</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Pincodes" hint="Separate with commas or spaces. Ranges like 110001-110010 work (up to 200).">
                <textarea
                  aria-label="Pincodes to include"
                  value={include.pincodes}
                  onChange={(e) => setInclude((d) => ({ ...d, pincodes: e.target.value }))}
                  rows={2}
                  className="w-full rounded-field bg-white px-3.5 py-2 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                />
              </Field>
              <Field label="Area name" hint="Optional, for your own reference.">
                <input
                  aria-label="Area name"
                  value={include.area}
                  onChange={(e) => setInclude((d) => ({ ...d, area: e.target.value }))}
                  className={field + " bg-white"}
                />
              </Field>
              <Field label="Warehouse" hint="Which stock these orders reserve.">
                <select
                  aria-label="Warehouse"
                  value={include.warehouseId}
                  onChange={(e) => setInclude((d) => ({ ...d, warehouseId: e.target.value }))}
                  className={field + " bg-white"}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Delivery time" hint="Minutes. Blank promises nothing.">
                <input
                  aria-label="Delivery time in minutes"
                  inputMode="numeric"
                  placeholder="no promise"
                  value={include.etaMinutes}
                  onChange={(e) => setInclude((d) => ({ ...d, etaMinutes: e.target.value }))}
                  className={field + " bg-white"}
                />
              </Field>
              <Field label="Delivery fee" hint="Rupees. Blank means free.">
                <input
                  aria-label="Delivery fee in rupees"
                  inputMode="decimal"
                  placeholder="free"
                  value={include.deliveryFee}
                  onChange={(e) => setInclude((d) => ({ ...d, deliveryFee: e.target.value }))}
                  className={field + " bg-white"}
                />
              </Field>
              <Field label="Cash on delivery">
                <select
                  aria-label="Cash on delivery allowed"
                  value={include.codAllowed ? "true" : "false"}
                  onChange={(e) => setInclude((d) => ({ ...d, codAllowed: e.target.value === "true" }))}
                  className={field + " bg-white"}
                >
                  <option value="false">Not offered</option>
                  <option value="true">Allowed</option>
                </select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={pending || include.pincodes.trim() === ""}
                onClick={() =>
                  run(actions.includePincodes({ cityId: city.id, ...include }), bulkText, () =>
                    setInclude((d) => ({ ...d, pincodes: "" }))
                  )
                }
                className="h-10 rounded-panel bg-ink px-5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {pending ? "Saving…" : "Include"}
              </button>
              <label className="h-10 cursor-pointer rounded-panel bg-chip px-4 text-[13px] font-bold leading-10 text-ink">
                Import a file
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  aria-label="Import a CSV file"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) run(actions.importCsv(await f.text(), city.id), bulkText);
                  }}
                />
              </label>
              <a
                href={"data:text/csv;charset=utf-8," + encodeURIComponent(CSV_TEMPLATE)}
                download="serviceability-template.csv"
                className="text-[12px] font-bold text-ink no-underline hover:underline"
              >
                Download the template
              </a>
            </div>
          </div>

          {editing && (
            <div className="mt-4 rounded-field bg-chip-soft p-3">
              <p className="text-[13px] font-bold text-ink">Editing {editing.pincode}</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="Area name">
                  <input
                    aria-label="Edit area name"
                    value={editing.areaText}
                    onChange={(e) => setEditing((d) => d && { ...d, areaText: e.target.value })}
                    className={field + " bg-white"}
                  />
                </Field>
                <Field label="Warehouse">
                  <select
                    aria-label="Edit warehouse"
                    value={editing.warehouseId}
                    onChange={(e) => setEditing((d) => d && { ...d, warehouseId: e.target.value })}
                    className={field + " bg-white"}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Delivery time (min)">
                  <input
                    aria-label="Edit delivery time"
                    value={editing.eta}
                    placeholder="no promise"
                    onChange={(e) => setEditing((d) => d && { ...d, eta: e.target.value })}
                    className={field + " bg-white"}
                  />
                </Field>
                <Field label="Delivery fee (₹)">
                  <input
                    aria-label="Edit delivery fee"
                    value={editing.fee}
                    placeholder="free"
                    onChange={(e) => setEditing((d) => d && { ...d, fee: e.target.value })}
                    className={field + " bg-white"}
                  />
                </Field>
                <Field label="Cash on delivery">
                  <select
                    aria-label="Edit cash on delivery"
                    value={editing.codAllowed ? "true" : "false"}
                    onChange={(e) => setEditing((d) => d && { ...d, codAllowed: e.target.value === "true" })}
                    className={field + " bg-white"}
                  >
                    <option value="false">Not offered</option>
                    <option value="true">Allowed</option>
                  </select>
                </Field>
              </div>
              <div className="mt-3 flex gap-2.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(
                      actions.savePincode({
                        pincode: editing.pincode,
                        cityId: city.id,
                        area: editing.areaText,
                        warehouseId: editing.warehouseId,
                        etaMinutes: editing.eta,
                        deliveryFee: editing.fee,
                        codAllowed: editing.codAllowed,
                        isActive: editing.isActive,
                      }),
                      () => `${editing.pincode} saved.`,
                      () => setEditing(null)
                    )
                  }
                  className="h-10 rounded-panel bg-ink px-5 text-[13px] font-bold text-white disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="h-10 rounded-panel bg-chip px-4 text-[13px] font-bold text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Pincodes */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
                  <th className="px-3 pb-2.5">Pincode</th>
                  <th className="px-3 pb-2.5">Area</th>
                  <th className="px-3 pb-2.5">Warehouse</th>
                  <th className="px-3 pb-2.5 text-right">Delivery time</th>
                  <th className="px-3 pb-2.5 text-right">Fee</th>
                  <th className="px-3 pb-2.5">COD</th>
                  <th className="px-3 pb-2.5">Status</th>
                  <th className="px-3 pb-2.5" />
                </tr>
              </thead>
              <tbody>
                {city.pincodes.map((p) => (
                  <tr key={p.pincode} className="border-t border-line">
                    <td className="px-3 py-3 text-[12.5px] font-bold tabular-nums">{p.pincode}</td>
                    <td className="px-3 py-3 text-[12px] font-semibold">{p.area ?? <span className="text-ink-500">—</span>}</td>
                    <td className="px-3 py-3 text-[12px] font-semibold">{p.warehouseName}</td>
                    <td className="px-3 py-3 text-right text-[12px] font-semibold tabular-nums">
                      {p.etaMinutes > 0 ? `${p.etaMinutes} min` : <span className="text-ink-500">none</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-[12px] font-semibold tabular-nums">
                      {p.deliveryFeePaise === 0 ? "Free" : formatPaise(p.deliveryFeePaise)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusChip tone={p.codAllowed ? "ok" : "neutral"}>{p.codAllowed ? "Allowed" : "Off"}</StatusChip>
                    </td>
                    <td className="px-3 py-3">
                      <StatusChip tone={!p.isActive ? "warn" : city.isLive ? "ok" : "neutral"}>
                        {!p.isActive ? "Excluded" : city.isLive ? "Delivering" : "Included (city off)"}
                      </StatusChip>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          setEditing({
                            ...p,
                            eta: p.etaMinutes > 0 ? String(p.etaMinutes) : "",
                            fee: p.deliveryFeePaise > 0 ? String(p.deliveryFeePaise / 100) : "",
                            areaText: p.area ?? "",
                          })
                        }
                        className="mr-2 h-8 rounded-full bg-chip px-3.5 text-[12px] font-bold text-ink disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={`${p.isActive ? "Exclude" : "Include"} ${p.pincode}`}
                        onClick={() =>
                          run(actions.setPincodeIncluded({ pincode: p.pincode, isActive: !p.isActive }), () =>
                            p.isActive ? `${p.pincode} excluded.` : `${p.pincode} included again.`
                          )
                        }
                        className="h-8 rounded-full bg-chip px-3.5 text-[12px] font-bold text-ink disabled:opacity-50"
                      >
                        {p.isActive ? "Exclude" : "Include"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {city.pincodes.length === 0 && (
              <p className="py-8 text-center text-[13px] font-semibold text-ink-500">
                No pincodes in {city.name} yet. Include some above.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] font-medium text-ink-500">{hint}</span>}
    </label>
  );
}
