"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { OrderStatus, BookingStatus } from "@/prisma/generated/client/client";
import { adminAdvanceOrder, adminAdvanceBooking } from "@/actions/admin";

/** Inline dropdown to advance an order or booking to an allowed next status. */
export function StatusControl({
  kind,
  id,
  options,
}: {
  kind: "order" | "booking";
  id: string;
  options: (OrderStatus | BookingStatus)[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (options.length === 0) {
    return <span className="text-xs font-semibold text-neutral-400">No actions</span>;
  }

  const onChange = (value: string, select: HTMLSelectElement) => {
    if (!value) return;
    /* A cancellation cannot be undone, and on a paid order it leaves a refund to
       issue. A mis-picked option used to cancel at once (staging UAT, 8 Nov 2026). */
    if (value === "cancelled" && !window.confirm(
      `Cancel this ${kind}? This cannot be undone.${kind === "order" ? " If it was paid, it moves to Payments → Refund required." : ""}`,
    )) {
      select.value = "";
      return;
    }
    setError(null);
    startTransition(async () => {
      /* The server's own sentence is shown. This control used to show a bare
         "!" and throw the reason away, so an operator refused a cancel because
         Razorpay showed the order paid, or told to use the dispatch board, could
         not tell which had happened. */
      try {
        const res =
          kind === "order"
            ? await adminAdvanceOrder(id, value as OrderStatus)
            : await adminAdvanceBooking(id, value as BookingStatus);
        if (res.ok) {
          router.refresh();
          return;
        }
        setError(res.error.message);
        /* Some refusals change what is on the server (a payment found while
           cancelling confirms the order), so the screen is re-read either way. */
        router.refresh();
      } catch {
        setError(`The change could not be confirmed. Reload to see the current status of this ${kind}.`);
      }
    });
  };

  return (
    <span className="inline-flex max-w-[22rem] flex-col items-start gap-1">
      {pending ? (
        <Loader2 className="size-4 animate-spin text-neutral-400" />
      ) : (
        <select
          defaultValue=""
          aria-label={`Change ${kind} status`}
          onChange={(e) => onChange(e.target.value, e.currentTarget)}
          className="cursor-pointer rounded-field border border-neutral-200 bg-white px-2 py-1 text-xs font-bold transition-colors hover:border-ink focus:border-ink focus:outline-none"
        >
          <option value="">Advance…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              → {o.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      )}
      {error && (
        <span role="alert" className="text-xs font-bold leading-snug text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
