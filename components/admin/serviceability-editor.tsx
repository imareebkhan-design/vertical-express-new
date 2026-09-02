"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSavePincode, adminImportPincodes } from "@/actions/serviceability";
import { CSV_TEMPLATE } from "@/lib/serviceability-csv";
import { formatPaise } from "@/lib/money";
import { StatusChip } from "@/components/admin/status-chip";

/**
 * Editing where we deliver.
 *
 * Two ways in, because operations has two shapes. One pincode at a time is how
 * a single exception gets handled — a lane a truck cannot use this month. A
 * file is how a courier's coverage change arrives, and typing forty rows by
 * hand is how one of them gets missed.
 *
 * The ETA field is deliberately blank-able and never pre-filled. It is a
 * delivery promise, and no delivery time is confirmed.
 */
export interface PincodeView {
  pincode: string;
  warehouseId: string;
  warehouseName: string;
  etaMinutes: number;
  deliveryFeePaise: number;
  codAllowed: boolean;
  isActive: boolean;
}

type Draft = {
  pincode: string;
  warehouseId: string;
  etaMinutes: string;
  deliveryFee: string;
  codAllowed: boolean;
  isActive: boolean;
  isNew: boolean;
};

export function ServiceabilityEditor({
  pincodes,
  warehouses,
  codGloballyOff,
}: {
  pincodes: PincodeView[];
  warehouses: { id: string; name: string }[];
  /** COD is a global setting; a per-pincode yes cannot override a global no. */
  codGloballyOff: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const edit = (p: PincodeView) =>
    setDraft({
      pincode: p.pincode,
      warehouseId: p.warehouseId,
      etaMinutes: p.etaMinutes > 0 ? String(p.etaMinutes) : "",
      deliveryFee: p.deliveryFeePaise > 0 ? String(p.deliveryFeePaise / 100) : "",
      codAllowed: p.codAllowed,
      isActive: p.isActive,
      isNew: false,
    });

  const save = () => {
    if (!draft) return;
    setMessage(null);
    start(async () => {
      const res = await adminSavePincode(draft);
      if (res.ok) {
        setDraft(null);
        setMessage({ ok: true, text: `${draft.pincode} saved.` });
        router.refresh();
      } else {
        setMessage({ ok: false, text: res.error.message });
      }
    });
  };

  const onFile = async (file: File) => {
    setMessage(null);
    setImporting(true);
    const text = await file.text();
    start(async () => {
      const res = await adminImportPincodes(text);
      setImporting(false);
      if (res.ok) {
        setMessage({
          ok: true,
          text: `${res.data.created} added, ${res.data.updated} changed, ${res.data.unchanged} already correct.`,
        });
        router.refresh();
      } else {
        setMessage({ ok: false, text: res.error.message });
      }
    });
  };

  const field =
    "h-10 w-full rounded-field bg-chip-soft px-3.5 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";

  const templateHref =
    "data:text/csv;charset=utf-8," + encodeURIComponent(CSV_TEMPLATE);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setDraft({
              pincode: "",
              warehouseId: warehouses[0]?.id ?? "",
              etaMinutes: "",
              deliveryFee: "",
              codAllowed: false,
              isActive: true,
              isNew: true,
            });
          }}
          className="h-10 rounded-panel bg-ink px-5 text-[13px] font-bold text-white"
        >
          Add a pincode
        </button>

        <label className="h-10 cursor-pointer rounded-panel bg-chip px-4 text-[13px] font-bold leading-10 text-ink">
          {importing ? "Importing…" : "Import a file"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
        </label>

        <a
          href={templateHref}
          download="serviceability-template.csv"
          className="text-[12px] font-bold text-ink no-underline hover:underline"
        >
          Download the template
        </a>

        {message && (
          <p
            className={
              "whitespace-pre-line text-[12.5px] font-semibold " +
              (message.ok ? "text-ink" : "text-ops-bad")
            }
            role="status"
          >
            {message.text}
          </p>
        )}
      </div>

      {codGloballyOff && (
        <p className="rounded-panel bg-ops-info-tint p-3.5 text-[12px] font-medium leading-[17px] text-ops-info">
          Cash on delivery is switched off for the whole shop in Settings. Allowing it on a
          pincode here will not offer it at checkout until that is turned on — the two are
          an AND, not an override.
        </p>
      )}

      {draft && (
        <div className="rounded-panel bg-white p-4 shadow-card">
          <p className="text-[13px] font-bold text-ink">
            {draft.isNew ? "New pincode" : `Editing ${draft.pincode}`}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Pincode" hint="Six digits, within Jammu & Kashmir.">
              <input
                value={draft.pincode}
                onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                readOnly={!draft.isNew}
                inputMode="numeric"
                placeholder="190001"
                aria-label="Pincode"
                className={field + (draft.isNew ? "" : " opacity-60")}
              />
            </Field>

            <Field label="Warehouse" hint="Which shed serves this pincode.">
              <select
                value={draft.warehouseId}
                onChange={(e) => set("warehouseId", e.target.value)}
                aria-label="Warehouse"
                className={field}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Delivery time"
              hint="Minutes. Leave blank to promise nothing — no delivery time is confirmed yet."
            >
              <input
                value={draft.etaMinutes}
                onChange={(e) => set("etaMinutes", e.target.value)}
                inputMode="numeric"
                placeholder="no promise"
                aria-label="Delivery time in minutes"
                className={field}
              />
            </Field>

            <Field label="Delivery fee" hint="In rupees. Blank means free.">
              <input
                value={draft.deliveryFee}
                onChange={(e) => set("deliveryFee", e.target.value)}
                inputMode="decimal"
                placeholder="free"
                aria-label="Delivery fee in rupees"
                className={field}
              />
            </Field>

            <Field label="Cash on delivery">
              <select
                value={draft.codAllowed ? "true" : "false"}
                onChange={(e) => set("codAllowed", e.target.value === "true")}
                aria-label="Cash on delivery allowed"
                className={field}
              >
                <option value="false">Not offered here</option>
                <option value="true">Allowed here</option>
              </select>
            </Field>

            <Field label="Serving" hint="Turning this off stops checkout accepting the address.">
              <select
                value={draft.isActive ? "true" : "false"}
                onChange={(e) => set("isActive", e.target.value === "true")}
                aria-label="Serving this pincode"
                className={field}
              >
                <option value="true">Serving</option>
                <option value="false">Paused</option>
              </select>
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={save}
              disabled={pending || draft.pincode.length !== 6}
              className="h-10 rounded-panel bg-ink px-5 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="h-10 rounded-panel bg-chip px-4 text-[13px] font-bold text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-panel bg-white p-4 shadow-card">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              <th className="px-3 pb-2.5">Pincode</th>
              <th className="px-3 pb-2.5">Warehouse</th>
              <th className="px-3 pb-2.5 text-right">Delivery time</th>
              <th className="px-3 pb-2.5 text-right">Fee</th>
              <th className="px-3 pb-2.5">COD</th>
              <th className="px-3 pb-2.5">Status</th>
              <th className="px-3 pb-2.5" />
            </tr>
          </thead>
          <tbody>
            {pincodes.map((p) => (
              <tr key={p.pincode} className="border-t border-line">
                <td className="px-3 py-3 text-[12.5px] font-bold tabular-nums">{p.pincode}</td>
                <td className="px-3 py-3 text-[12px] font-semibold">{p.warehouseName}</td>
                <td className="px-3 py-3 text-right text-[12px] font-semibold tabular-nums">
                  {p.etaMinutes > 0 ? `${p.etaMinutes} min` : <span className="text-ink-500">none</span>}
                </td>
                <td className="px-3 py-3 text-right text-[12px] font-semibold tabular-nums">
                  {p.deliveryFeePaise === 0 ? "Free" : formatPaise(p.deliveryFeePaise)}
                </td>
                <td className="px-3 py-3">
                  <StatusChip tone={p.codAllowed ? "ok" : "neutral"}>
                    {p.codAllowed ? "Allowed" : "Off"}
                  </StatusChip>
                </td>
                <td className="px-3 py-3">
                  <StatusChip tone={p.isActive ? "ok" : "warn"}>
                    {p.isActive ? "Serving" : "Paused"}
                  </StatusChip>
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => edit(p)}
                    disabled={pending}
                    className="h-8 rounded-full bg-chip px-3.5 text-[12px] font-bold text-ink disabled:opacity-50"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pincodes.length === 0 && (
          <p className="py-10 text-center text-[13px] font-semibold text-ink-500">
            No serviceable pincodes. Checkout will reject every address.
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] font-medium text-ink-500">{hint}</span>}
    </label>
  );
}
