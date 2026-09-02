"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminAdjustStock } from "@/actions/inventory";

/**
 * Changing one stock count, with a reason.
 *
 * Opens on a row rather than living permanently on every row: a warehouse
 * screen with forty always-editable number fields is one mis-click away from a
 * wrong count nobody notices.
 *
 * The delta is entered, not the new total. "+12 received" and "−3 damaged" are
 * what actually happened, and they are what the ledger has to record; asking
 * for the new total would mean deriving the movement by subtraction and losing
 * the operator's intent when the count moved underneath them.
 */
const REASONS = [
  { value: "recount", label: "Recount — what I found on the shelf" },
  { value: "received", label: "Received from supplier" },
  { value: "damaged", label: "Damaged or unsellable" },
  { value: "lost", label: "Lost — counted before, missing now" },
  { value: "transfer", label: "Transferred to another warehouse" },
  { value: "correction", label: "Correcting an earlier movement" },
] as const;

export function StockAdjuster({
  variantId,
  warehouseId,
  sku,
  onHand,
}: {
  variantId: string;
  warehouseId: string;
  sku: string;
  onHand: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<string>("recount");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(delta);
  const valid = delta.trim() !== "" && Number.isInteger(parsed) && parsed !== 0;
  const projected = valid ? onHand + parsed : onHand;

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await adminAdjustStock({
        variantId,
        warehouseId,
        qtyDelta: parsed,
        reason,
        note: note.trim() || undefined,
      });
      if (res.ok) {
        setOpen(false);
        setDelta("");
        setNote("");
        router.refresh();
      } else {
        setError(res.error.message);
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 rounded-full bg-chip px-3.5 text-[12px] font-bold text-ink"
      >
        Adjust
      </button>
    );
  }

  const field =
    "h-9 rounded-field bg-chip-soft px-3 text-[12.5px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";

  return (
    <div className="flex flex-col gap-2 rounded-field bg-chip-soft p-3 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          inputMode="numeric"
          placeholder="+12 or −3"
          aria-label={`Change in units for ${sku}`}
          className={`${field} w-24`}
        />
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label={`Reason for adjusting ${sku}`}
          className={`${field} w-64`}
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={reason === "recount" ? "What did you find? (required)" : "Note (optional)"}
        aria-label={`Note for ${sku}`}
        className={`${field} w-full`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !valid || (reason === "recount" && !note.trim())}
          className="h-9 rounded-panel bg-ink px-4 text-[12.5px] font-bold text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Apply"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="h-9 rounded-panel bg-chip px-3.5 text-[12.5px] font-bold text-ink"
        >
          Cancel
        </button>
        {valid && (
          <span className="text-[12px] font-semibold text-ink-700">
            {onHand} → <span className="font-extrabold text-ink">{projected}</span>
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-[12px] font-semibold text-ops-bad">
          {error}
        </p>
      )}
    </div>
  );
}
