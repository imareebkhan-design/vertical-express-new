"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminMoveReturn } from "@/actions/returns";
import { RETURN_STATUS_LABEL } from "@/lib/return-flow";
import type { ReturnStatus } from "@/prisma/generated/client/client";

/** The next review steps for a return request, with a note; decisions need one. */
export function ReturnActions({ returnNo, next }: { returnNo: string; next: ReturnStatus[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (next.length === 0) return <p className="text-[12px] font-semibold text-ink-500">Closed — no further steps.</p>;
  return (
    <div className="flex flex-col gap-2.5">
      <textarea
        aria-label="Note"
        rows={2}
        placeholder="Note (required to approve or reject)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-field bg-chip-soft px-3.5 py-2 text-[13px] font-semibold text-ink"
      />
      <div className="flex flex-wrap gap-2">
        {next.map((to) => (
          <button
            key={to}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setErr(null);
                const r = await adminMoveReturn({ returnNo, to, note });
                if (r.ok) {
                  setNote("");
                  router.refresh();
                } else setErr(r.error.message);
              })
            }
            className={`h-9 rounded-panel px-4 text-[12.5px] font-bold disabled:opacity-50 ${to === "rejected" ? "bg-chip text-ops-bad" : "bg-ink text-white"}`}
          >
            {to === "approved" ? "Approve for collection" : `Move to ${RETURN_STATUS_LABEL[to].toLowerCase()}`}
          </button>
        ))}
      </div>
      {err && <p role="alert" className="text-[12.5px] font-semibold text-ops-bad">{err}</p>}
      <p className="text-[11px] font-semibold text-ink-500">Approving records the decision only — no refund, restock or exchange happens until the return policy is approved.</p>
    </div>
  );
}
