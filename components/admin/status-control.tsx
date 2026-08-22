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
  const [error, setError] = useState(false);

  if (options.length === 0) {
    return <span className="text-xs font-semibold text-neutral-400">No actions</span>;
  }

  const onChange = (value: string) => {
    if (!value) return;
    setError(false);
    startTransition(async () => {
      const res =
        kind === "order"
          ? await adminAdvanceOrder(id, value as OrderStatus)
          : await adminAdvanceBooking(id, value as BookingStatus);
      if (res.ok) router.refresh();
      else setError(true);
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      {pending ? (
        <Loader2 className="size-4 animate-spin text-neutral-400" />
      ) : (
        <select
          defaultValue=""
          onChange={(e) => onChange(e.target.value)}
          className="cursor-pointer rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-bold transition-colors hover:border-ink focus:border-ink focus:outline-none"
        >
          <option value="">Advance…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              → {o.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      )}
      {error && <span className="text-xs font-bold text-danger">!</span>}
    </span>
  );
}
