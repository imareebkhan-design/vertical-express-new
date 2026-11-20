"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/validators";
import { istLocalInput } from "@/lib/ist";
import { RETURN_REASON_LABEL } from "@/lib/return-flow";

/**
 * Record a customer's return request against delivered items. Records only:
 * the screen says plainly that nothing is refunded or restocked here.
 */
export interface ReturnableLine {
  orderItemId: string;
  title: string;
  variantName: string;
  delivered: number;
  requested: number;
  returnable: number;
}
export type CreateReturn = (i: {
  orderNo: string;
  items: { orderItemId: string; qty: number }[];
  reason: string;
  explanation: string;
  requestedAtIst: string;
  channel: string;
}) => Promise<ActionResult<{ returnNo: string }>>;

const field =
  "h-10 w-full rounded-field bg-chip-soft px-3.5 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";

export function ReturnIntakeView({ orderNo, lines, create, onDone }: { orderNo: string; lines: ReturnableLine[]; create: CreateReturn; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("damaged_in_transit");
  const [explanation, setExplanation] = useState("");
  const [when, setWhen] = useState(() => istLocalInput(new Date()));
  const [channel, setChannel] = useState("Phone call");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const available = lines.filter((l) => l.returnable > 0);

  if (available.length === 0) {
    return <p className="text-[12px] font-semibold text-ink-500">Nothing on this order can be returned: only delivered items that are not already requested.</p>;
  }
  if (!open) {
    return (
      <div>
        {msg && <p role="status" className="mb-2 text-[12.5px] font-semibold text-ink">{msg.text}</p>}
        <button type="button" onClick={() => setOpen(true)} className="h-9 rounded-panel bg-chip px-4 text-[12.5px] font-bold text-ink">
          Record a return request
        </button>
      </div>
    );
  }
  return (
    <form
      aria-label="Record a return request"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await create({
            orderNo,
            items: available.map((l) => ({ orderItemId: l.orderItemId, qty: Number(qty[l.orderItemId] || 0) })),
            reason, explanation, requestedAtIst: when, channel,
          });
          if (r.ok) {
            setOpen(false);
            setQty({});
            setExplanation("");
            setMsg({ ok: true, text: `${r.data.returnNo} recorded. Nothing has been refunded or restocked.` });
            onDone();
          } else setMsg({ ok: false, text: r.error.message });
        });
      }}
    >
      <p className="rounded-[12px] bg-ops-warn-tint px-3 py-2 text-[11.5px] font-semibold leading-[16px] text-ops-warn">
        This records the request only. The return window, opened-material rules and refund policy are awaiting the
        owner&rsquo;s approval, so nothing is refunded, restocked or exchanged from here.
      </p>
      <ul className="flex flex-col gap-2">
        {available.map((l) => (
          <li key={l.orderItemId} className="flex items-center gap-3">
            <label className="min-w-0 flex-1 text-[12.5px] font-semibold">
              {l.title} <span className="text-ink-500">· {l.variantName} · up to {l.returnable} of {l.delivered} delivered</span>
            </label>
            <input
              type="number"
              min={0}
              max={l.returnable}
              inputMode="numeric"
              aria-label={`Quantity to return: ${l.title}`}
              value={qty[l.orderItemId] ?? ""}
              onChange={(e) => setQty((q) => ({ ...q, [l.orderItemId]: e.target.value }))}
              className={field + " w-24"}
            />
          </li>
        ))}
      </ul>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
          Reason
          <select aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className={field + " mt-1"}>
            {Object.entries(RETURN_REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
          Asked at (IST)
          <input type="datetime-local" aria-label="Asked at" value={when} onChange={(e) => setWhen(e.target.value)} className={field + " mt-1"} />
        </label>
        <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
          How they asked
          <select aria-label="How they asked" value={channel} onChange={(e) => setChannel(e.target.value)} className={field + " mt-1"}>
            {["Phone call", "At delivery", "WhatsApp", "Email", "Other"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
        What the customer said
        <textarea aria-label="What the customer said" rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} className="mt-1 w-full rounded-field bg-chip-soft px-3.5 py-2 text-[13px] font-semibold text-ink" />
      </label>
      {msg && !msg.ok && <p role="alert" className="text-[12.5px] font-semibold text-ops-bad">{msg.text}</p>}
      <div className="flex gap-2.5">
        <button type="submit" disabled={pending} className="h-10 rounded-panel bg-ink px-5 text-[13px] font-bold text-white disabled:opacity-50">
          {pending ? "Saving…" : "Record request"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-panel bg-chip px-4 text-[13px] font-bold text-ink">Cancel</button>
      </div>
    </form>
  );
}
