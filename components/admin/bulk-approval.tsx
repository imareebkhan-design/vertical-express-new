"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/validators";
import type { BatchApprovalItem } from "@/lib/services/admin/catalogue-approval";

export interface BulkRow {
  productId: string;
  imageId: string;
  sha256: string;
  updatedAt: string;
  title: string;
  brand: string;
  url: string;
  packSensitive: boolean;
}

type Submit = (input: { items: BatchApprovalItem[]; evidence: string }) => Promise<
  ActionResult<{ approved: string[]; failed: { productId: string; message: string }[] }>
>;

/**
 * Approve many products from one screen of photos. Nothing starts ticked: each
 * product is approved only because the owner ticked it after looking at it.
 */
export function BulkApproval({ rows, submit }: { rows: BulkRow[]; submit: Submit }) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [pack, setPack] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState("");
  const [looked, setLooked] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const chosen = rows.filter((r) => ticked.has(r.productId));
  const missingPack = chosen.filter((r) => r.packSensitive && (pack[r.productId] ?? "").trim().length === 0);
  const ready = chosen.length > 0 && looked && evidence.trim().length >= 5 && missingPack.length === 0;
  const allTicked = useMemo(() => rows.length > 0 && rows.every((r) => ticked.has(r.productId)), [rows, ticked]);

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const approve = () =>
    start(async () => {
      setResult(null);
      const res = await submit({
        evidence,
        items: chosen.map((r) => ({
          productId: r.productId,
          imageId: r.imageId,
          expectedImageSha256: r.sha256,
          expectedProductUpdatedAt: r.updatedAt,
          packDecision: r.packSensitive ? pack[r.productId] ?? null : null,
        })),
      });
      if (!res.ok) setResult(res.error.message);
      else {
        const { approved, failed } = res.data;
        setResult(
          `${approved.length} approved.` +
            (failed.length ? ` ${failed.length} not saved: ${failed.map((f) => f.message).join("; ")}` : "")
        );
        setTicked(new Set());
        setLooked(false);
      }
    });

  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="bulk-h" className="mb-8 rounded-card border border-neutral-200 bg-white p-4 shadow-card">
      <h2 id="bulk-h" className="text-lg font-extrabold">Approve several at once</h2>
      <p className="mt-1 text-sm font-semibold text-neutral-500">
        Tick each product whose photo and title match (identity confirmed, exact photo). Leave anything doubtful unticked
        and use the full form below for it.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-bold">
        <button
          type="button"
          className="underline"
          onClick={() => setTicked(allTicked ? new Set() : new Set(rows.map((r) => r.productId)))}
        >
          {allTicked ? "Untick all" : "Tick all"}
        </button>
        <span>{chosen.length} of {rows.length} ticked</span>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map((r) => {
          const on = ticked.has(r.productId);
          return (
            <li key={r.productId} className={`rounded-lg border p-2 ${on ? "border-ink" : "border-neutral-200"}`}>
              <label className="flex cursor-pointer flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- the exact stored bytes being approved */}
                <img src={r.url} alt={r.title} className="aspect-square w-full rounded bg-white object-contain" />
                <span className="flex items-start gap-2 text-xs font-bold leading-snug">
                  <input type="checkbox" checked={on} onChange={() => toggle(r.productId)} aria-label={`Approve ${r.title}`} />
                  <span>{r.brand} · {r.title}</span>
                </span>
              </label>
              {r.packSensitive && on && (
                <input
                  className="mt-2 w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                  placeholder="Pack / contents (e.g. 12 bits in case)"
                  aria-label={`Pack or contents for ${r.title}`}
                  value={pack[r.productId] ?? ""}
                  onChange={(e) => setPack((p) => ({ ...p, [r.productId]: e.target.value }))}
                />
              )}
            </li>
          );
        })}
      </ul>
      <label className="mt-4 block text-sm font-bold" htmlFor="bulk-evidence">Evidence (applies to every ticked product)</label>
      <textarea
        id="bulk-evidence"
        className="mt-1 w-full rounded border border-neutral-300 p-2 text-sm"
        placeholder="e.g. Checked each photo and model name against the manufacturer catalogue"
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
      />
      <label className="mt-3 flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={looked} onChange={(e) => setLooked(e.target.checked)} />
        I have looked at every ticked photo and title
      </label>
      {missingPack.length > 0 && (
        <p className="mt-2 text-sm font-bold text-danger">Add the pack / contents for: {missingPack.map((r) => r.title).join(", ")}</p>
      )}
      <Button className="mt-3" onClick={approve} disabled={!ready || busy}>
        {busy ? "Saving…" : `Approve ${chosen.length} product${chosen.length === 1 ? "" : "s"}`}
      </Button>
      {result && <p role="status" className="mt-3 text-sm font-bold">{result}</p>}
    </section>
  );
}
