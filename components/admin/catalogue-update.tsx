"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/validators";
import type { ApplyResult, FieldChange, RowAction, UpdatePlan } from "@/lib/services/admin/catalogue-update";
import { formatPaise } from "@/lib/money";

/**
 * Updating products already in the catalogue from a file — variants, MRPs and
 * prices on one sheet, shelf counts on the other.
 *
 * Export → edit → upload → read the preview → apply. The export carries each
 * variant's current price and MRP, so an edit made from an old export is
 * caught as a conflict rather than overwriting a newer change. Apply sends the
 * preview's digest; if the shop changed since, nothing is written and the new
 * preview is shown instead. Publishing is not here: it stays on each product,
 * behind the publish gate.
 *
 * The actions are props so the screen can be tested without a server.
 */
type Kind = "variants" | "stock";

export interface CatalogueUpdateActions {
  preview: (input: { kind: Kind; csv: string }) => Promise<ActionResult<UpdatePlan>>;
  apply: (input: { kind: Kind; csv: string; digest: string }) => Promise<ActionResult<ApplyResult>>;
  exportSheet: (input: { kind: Kind }) => Promise<ActionResult<{ csv: string }>>;
}

const ACTION_LABEL: Record<RowAction, string> = {
  create: "Add",
  update: "Change",
  unchanged: "No change",
  invalid: "Fix in file",
  conflict: "Conflict",
};

const ACTION_TONE: Record<RowAction, string> = {
  create: "bg-ops-ok-tint text-ops-ok",
  update: "bg-ops-ok-tint text-ops-ok",
  unchanged: "bg-chip text-ink-500",
  invalid: "bg-ops-warn-tint text-ops-warn",
  conflict: "bg-ops-warn-tint text-ops-warn",
};

function describe(c: FieldChange): string {
  const money = (v: FieldChange["from"]) => (typeof v === "number" ? formatPaise(v) : v === null ? "—" : String(v));
  switch (c.field) {
    case "mrpPaise": return `MRP ${money(c.from)} → ${money(c.to)}`;
    case "pricePaise": return `Price ${money(c.from)} → ${money(c.to)}`;
    case "name": return c.from === null ? `“${c.to}”` : `Name “${c.from}” → “${c.to}”`;
    case "isDefault": return "Becomes the default";
    case "qtyOnHand": return `On hand ${c.from ?? "no record"} → ${c.to}`;
  }
}

export function CatalogueUpdate({ actions }: { actions: CatalogueUpdateActions }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("variants");
  const [pending, start] = useTransition();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<UpdatePlan | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const reset = () => { setCsv(null); setFileName(null); setPlan(null); };

  const onFile = async (file: File) => {
    reset();
    setMessage(null);
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    start(async () => {
      const res = await actions.preview({ kind, csv: text });
      if (res.ok) setPlan(res.data);
      else setMessage({ ok: false, text: res.error.message });
    });
  };

  const onApply = () => {
    if (!csv || !plan) return;
    setMessage(null);
    start(async () => {
      const res = await actions.apply({ kind, csv, digest: plan.digest });
      if (!res.ok) return setMessage({ ok: false, text: res.error.message });
      const r = res.data;
      if (r.ok) {
        setMessage({ ok: true, text: `Applied: ${r.created} added, ${r.updated} changed, ${r.unchanged} unchanged. Recorded as batch ${r.batchId.slice(0, 8)}.` });
        reset();
        router.refresh();
      } else if (r.reason === "stale") {
        setMessage({ ok: false, text: "Someone changed one of these while it was being applied. Nothing was written — preview the file again." });
      } else {
        setPlan(r.plan);
        setMessage({ ok: false, text: r.reason === "plan_changed"
          ? "The catalogue changed since your preview. Nothing was written — here is the new preview."
          : "This file has rows to fix or conflicts. Nothing was written." });
      }
    });
  };

  const onExport = () => {
    start(async () => {
      const res = await actions.exportSheet({ kind });
      if (!res.ok) return setMessage({ ok: false, text: res.error.message });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([res.data.csv], { type: "text/csv" }));
      a.download = kind === "variants" ? "catalogue-variants.csv" : "catalogue-stock-counts.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };

  return (
    <section className="rounded-panel bg-white p-4 shadow-card">
      <div role="tablist" aria-label="Which file" className="flex gap-2">
        {(["variants", "stock"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={kind === k}
            disabled={pending}
            onClick={() => { setKind(k); reset(); setMessage(null); }}
            className={`h-9 rounded-panel px-3 text-[12.5px] font-bold ${kind === k ? "bg-ink text-white" : "bg-chip text-ink"}`}
          >
            {k === "variants" ? "Variants, MRP & price" : "Stock counts"}
          </button>
        ))}
      </div>

      <p className="mt-3 text-[12px] font-medium leading-[17px] text-ink-700">
        {kind === "variants"
          ? "One row per variant (SKU) of a product already in the catalogue. Start from the export so each row carries the current price and MRP. The price may equal the MRP or be lower, never higher; a changed MRP needs its evidence. New SKUs leave both current_ cells blank."
          : "One row per SKU and warehouse, with what was counted on the shelf. The count replaces the on-hand figure; it is never added to it, and reservations for open orders are not touched."}
        {" "}Nothing here publishes a product.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onExport} disabled={pending} className="h-10 rounded-panel bg-chip px-4 text-[13px] font-bold text-ink">
          Export current {kind === "variants" ? "variants" : "stock"}
        </button>
        <label className="h-10 cursor-pointer rounded-panel bg-chip px-4 text-[13px] font-bold leading-10 text-ink">
          {fileName ? "Choose another file" : "Upload edited file"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            aria-label="Upload edited file"
            disabled={pending}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
          />
        </label>
        {fileName && <span className="text-[12px] font-semibold text-ink-500">{fileName}</span>}
      </div>

      {message && (
        <p role="status" className={`mt-3 rounded-panel p-3 text-[12.5px] font-semibold ${message.ok ? "bg-ops-ok-tint text-ops-ok" : "bg-ops-warn-tint text-ops-warn"}`}>
          {message.text}
        </p>
      )}

      {plan && (
        <div className="mt-4">
          <p className="text-[12.5px] font-bold text-ink" aria-label="Preview summary">
            {plan.counts.create} to add · {plan.counts.update} to change · {plan.counts.unchanged} unchanged · {plan.counts.invalid} to fix · {plan.counts.conflict} conflicts
          </p>
          <div className="mt-2 max-h-[420px] overflow-auto rounded-panel border border-line">
            <table className="w-full text-left text-[12px]">
              <thead className="sticky top-0 bg-chip text-[11px] uppercase tracking-[0.06em] text-ink-500">
                <tr><th className="px-2 py-1.5">Line</th><th className="px-2 py-1.5">Result</th><th className="px-2 py-1.5">{kind === "variants" ? "Product" : "Warehouse"}</th><th className="px-2 py-1.5">SKU</th><th className="px-2 py-1.5">What happens</th></tr>
              </thead>
              <tbody>
                {plan.rows.map((r, i) => (
                  <tr key={`${r.line}-${i}`} className="border-t border-line align-top">
                    <td className="px-2 py-1.5 tabular-nums">{r.line}</td>
                    <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${ACTION_TONE[r.action]}`}>{ACTION_LABEL[r.action]}</span></td>
                    <td className="px-2 py-1.5">{r.scope}</td>
                    <td className="px-2 py-1.5 font-mono">{r.sku}</td>
                    <td className="px-2 py-1.5">{r.message ?? (r.changes.map(describe).join("; ") || "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={onApply}
            disabled={pending || !plan.applicable}
            className="mt-3 h-10 rounded-panel bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-40"
          >
            {plan.applicable ? `Apply ${plan.counts.create + plan.counts.update} changes` : "Nothing can be applied until every row is fixed"}
          </button>
        </div>
      )}
    </section>
  );
}
