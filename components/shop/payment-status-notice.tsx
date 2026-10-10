"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describePaymentStatus, type PaymentStateName } from "@/lib/payment-status-copy";
import type { ActionResult } from "@/lib/validators";

/**
 * Shown when Razorpay Checkout closes, its callback cannot be verified, or a
 * retried order may already be paying. Asks the SERVER (checkPaymentStatus →
 * lib/services/payment-status.ts) what happened; the browser never decides.
 */
export function PaymentStatusNotice({
  orderNo,
  check,
  initialState = null,
  onPaid,
  onPay,
  orderHref,
}: {
  orderNo: string;
  check: (orderNo: string) => Promise<ActionResult<{ state: PaymentStateName }>>;
  /** A state the server already gave (e.g. a replayed place-order); skips the first check. */
  initialState?: PaymentStateName | null;
  onPaid: () => void;
  /** Offered only when the server says nothing was paid and nothing is in flight. */
  onPay?: () => void;
  orderHref: string;
}) {
  const [state, setState] = useState<PaymentStateName | null>(initialState);
  const [checking, setChecking] = useState(false);
  const paidSeen = useRef(false);

  const run = useCallback(async () => {
    setChecking(true);
    try {
      const res = await check(orderNo);
      setState(res.ok ? res.data.state : null);
    } catch {
      setState(null);
    } finally {
      setChecking(false);
    }
  }, [check, orderNo]);

  useEffect(() => {
    if (initialState === null) void run();
  }, [initialState, run]);

  useEffect(() => {
    if (state === "paid" && !paidSeen.current) {
      paidSeen.current = true;
      onPaid();
    }
  }, [state, onPaid]);

  const copy = describePaymentStatus(checking && state === null ? null : state);
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-card border border-hairline-border bg-white p-4 text-sm font-semibold text-ink shadow-card"
    >
      <p>{checking && state === null ? "Checking your payment status…" : copy.message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {copy.action === "check" && (
          <Button type="button" onClick={run} disabled={checking}>
            <RefreshCw className={`mr-2 size-4 ${checking ? "animate-spin" : ""}`} aria-hidden />
            {checking ? "Checking…" : "Check payment status"}
          </Button>
        )}
        {copy.action === "pay" && onPay && (
          <Button type="button" onClick={onPay} disabled={checking}>
            Pay now
          </Button>
        )}
        <Link href={orderHref} className="underline underline-offset-2">
          View order
        </Link>
        <Link href="/account/orders" className="underline underline-offset-2">
          My orders
        </Link>
      </div>
    </div>
  );
}
