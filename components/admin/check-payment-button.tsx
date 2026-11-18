"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/validators";
import type { AdminPaymentCheckMessage, AdminPaymentCheckResult } from "@/lib/admin-payment-check";

export type CheckOrderPayment = (input: {
  orderId: string;
}) => Promise<ActionResult<AdminPaymentCheckMessage & { result: AdminPaymentCheckResult }>>;

const TONE_TEXT: Record<AdminPaymentCheckMessage["tone"], string> = {
  ok: "text-ops-ok",
  info: "text-ink-500",
  warn: "text-ops-warn",
  bad: "text-ops-bad",
};

/**
 * "Check payment" on an order awaiting payment (roadmap B-4).
 *
 * One click asks Razorpay. It can only confirm an order Razorpay says is paid,
 * so it needs no second "are you sure" step. The answer is shown in the
 * server's own words, which always say whether anything changed, and the page
 * is re-read when it did.
 */
export function CheckPaymentButton({ orderId, check }: { orderId: string; check: CheckOrderPayment }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [told, setTold] = useState<{ tone: AdminPaymentCheckMessage["tone"]; text: string } | null>(null);

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setTold(null);
          start(async () => {
            try {
              const r = await check({ orderId });
              if (r.ok) {
                setTold({ tone: r.data.tone, text: r.data.message });
                if (r.data.changed) router.refresh();
              } else {
                setTold({ tone: "bad", text: r.error.message });
              }
            } catch {
              setTold({ tone: "bad", text: "The check could not be completed. Reload the page to see the order's current state." });
            }
          });
        }}
        className="inline-flex h-9 w-fit items-center gap-2 rounded-panel bg-ink px-4 text-[12.5px] font-bold text-white disabled:opacity-60"
      >
        {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        {pending ? "Asking Razorpay…" : "Check payment with Razorpay"}
      </button>
      {told && (
        <p
          role={told.tone === "bad" ? "alert" : "status"}
          className={"text-[12px] font-semibold leading-[17px] " + TONE_TEXT[told.tone]}
        >
          {told.text}
        </p>
      )}
    </div>
  );
}
