"use client";

import { useState, useTransition } from "react";
import { formatPaise } from "@/lib/money";
import type { ActionResult } from "@/lib/validators";

export type RefundPayment = (input: { paymentId: string; reason: string }) => Promise<ActionResult<{ refundId: string; status: "processed" | "pending" }>>;
export type CheckRefund = (input: { refundId: string }) => Promise<ActionResult<{ status: string | null; found: boolean }>>;

const MIN_REASON = 10;

/**
 * Refund one payment from the "Refund required" list (ISS-025).
 *
 * Two steps, like the catalogue import: the first click only arms the button
 * and shows the exact amount; the second sends it. Money that leaves cannot be
 * called back, so a single mis-click must not be enough. The amount shown is
 * the payment's; the server works out what is still owed and refuses anything
 * that is not refundable.
 */
export function RefundControl({
  paymentId,
  amountPaise,
  refund,
}: {
  paymentId: string;
  amountPaise: number;
  refund: RefundPayment;
}) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-field border border-ops-bad px-2.5 py-1 text-[11px] font-extrabold text-ops-bad"
      >
        Refund…
      </button>
    );
  }

  const tooShort = reason.trim().length < MIN_REASON;
  return (
    <div className="w-full max-w-md rounded-panel bg-white p-3 shadow-card">
      <label className="block text-[11px] font-extrabold text-ink" htmlFor={`refund-reason-${paymentId}`}>
        Why is this being refunded?
      </label>
      <textarea
        id={`refund-reason-${paymentId}`}
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          setArmed(false);
        }}
        rows={2}
        maxLength={500}
        className="mt-1 w-full rounded-field border border-neutral-300 px-2 py-1 text-[12px]"
      />
      {message && (
        <p role={message.ok ? "status" : "alert"} className={"mt-1 text-[11px] font-bold " + (message.ok ? "text-success" : "text-danger")}>
          {message.text}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || tooShort}
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            setMessage(null);
            start(async () => {
              const r = await refund({ paymentId, reason });
              setArmed(false);
              if (r.ok) {
                setMessage({
                  ok: true,
                  text: r.data.status === "processed" ? "Refunded. Razorpay has sent the money back." : "Refund accepted. Razorpay is sending the money back.",
                });
              } else {
                setMessage({ ok: false, text: r.error.message });
              }
            });
          }}
          className={
            "rounded-field px-3 py-1.5 text-[11px] font-extrabold disabled:opacity-50 " +
            (armed ? "bg-ops-bad text-white" : "border border-ops-bad text-ops-bad")
          }
        >
          {pending ? "Refunding…" : armed ? `Confirm: send ${formatPaise(amountPaise)} back` : `Refund ${formatPaise(amountPaise)}`}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setArmed(false);
            setMessage(null);
          }}
          className="rounded-field px-3 py-1.5 text-[11px] font-bold text-ink-500"
        >
          Cancel
        </button>
      </div>
      {tooShort && <p className="mt-1 text-[10.5px] font-semibold text-ink-500">At least {MIN_REASON} characters; it is kept with the refund.</p>}
    </div>
  );
}

/** Ask Razorpay what became of a refund that is still in progress. */
export function RefundCheck({ refundId, check }: { refundId: string; check: CheckRefund }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await check({ refundId });
            if (!r.ok) setText(r.error.message);
            else if (r.data.found) setText(`Razorpay says: ${r.data.status}`);
            else setText(r.data.status === "failed" ? "Razorpay has no such refund; the payment can be refunded again." : "Razorpay has no record yet. Check again in a few minutes.");
          })
        }
        className="rounded-field border border-neutral-300 px-2 py-0.5 text-[11px] font-bold disabled:opacity-50"
      >
        {pending ? "Checking…" : "Check with Razorpay"}
      </button>
      {text && <span role="status" className="text-[11px] font-semibold text-ink-500">{text}</span>}
    </span>
  );
}
