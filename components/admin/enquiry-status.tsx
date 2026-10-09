"use client";

import { useState, useTransition } from "react";
import { adminSetProductEnquiryStatus } from "@/actions/product-enquiry";

const STATUSES = ["new", "contacted", "quoted", "closed", "spam"] as const;

/** Status picker for one enquiry. Every change is audited server-side. */
export function EnquiryStatus({ id, status }: { id: string; status: string }) {
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <select
        aria-label="Enquiry status"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next);
          setError(null);
          start(async () => {
            const r = await adminSetProductEnquiryStatus({ enquiryId: id, status: next });
            if (!r.ok) {
              setValue(prev);
              setError(r.error.message);
            }
          });
        }}
        className="rounded-field border border-neutral-300 bg-white px-2 py-1 text-xs font-bold capitalize"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {error && <p role="alert" className="mt-1 text-[11px] font-bold text-danger">{error}</p>}
    </div>
  );
}
