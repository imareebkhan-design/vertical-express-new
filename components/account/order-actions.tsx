"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCard, FileText, Loader2, RotateCcw, XCircle } from "lucide-react";
import { cancelOrder, reorder, retryOrderPayment } from "@/actions/orders";
import { confirmRazorpayPayment } from "@/actions/checkout";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";

/** Cancel / reorder / retry controls on the order detail page. */
export function OrderActions({
  orderNo,
  cancellable,
  status,
  email,
}: {
  orderNo: string;
  cancellable: boolean;
  status?: string;
  email?: string | null;
}) {
  const router = useRouter();
  const { refresh } = useCart();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const isPendingPayment = status === "pending_payment";

  const doCancel = () => {
    setError(null);
    startTransition(async () => {
      const res = await cancelOrder(orderNo, "Cancelled by customer");
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  };

  const doReorder = () => {
    setError(null);
    startTransition(async () => {
      const res = await reorder(orderNo);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      await refresh();
      router.push("/cart");
    });
  };

  const doRetryPayment = () => {
    setError(null);
    startTransition(async () => {
      const res = await retryOrderPayment(orderNo);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      if (res.data.razorpay?.orderId && res.data.razorpay.keyId) {
        await openRazorpay(orderNo, res.data.razorpay);
      } else {
        router.refresh();
      }
    });
  };

  const openRazorpay = async (
    orderNumber: string,
    rzp: { orderId: string; amountPaise: number; keyId: string }
  ) => {
    await loadRazorpayScript();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Razorpay = (window as any).Razorpay;
    if (!Razorpay) {
      setError("Couldn't load payment window.");
      return;
    }
    const rz = new Razorpay({
      key: rzp.keyId,
      amount: rzp.amountPaise,
      currency: "INR",
      name: "Vertical Express",
      order_id: rzp.orderId,
      prefill: { email: email ?? undefined },
      theme: { color: "#EDAF1C" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: async (r: any) => {
        const confirm = await confirmRazorpayPayment({
          orderNo: orderNumber,
          razorpayOrderId: rzp.orderId,
          razorpayPaymentId: r.razorpay_payment_id,
          signature: r.razorpay_signature,
        });
        if (!confirm.ok) {
          setError(confirm.error.message);
          return;
        }
        await refresh();
        router.refresh();
      },
      modal: {
        ondismiss: () => setError("Payment modal was closed."),
      },
    });
    rz.open();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {isPendingPayment && (
          <Button onClick={doRetryPayment} disabled={pending} className="bg-brand-deep text-white hover:opacity-90">
            {pending ? <Loader2 className="animate-spin" /> : <CreditCard className="size-4" />} Complete Payment
          </Button>
        )}
        <Button variant="outline" onClick={doReorder} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <RotateCcw className="size-4" />} Reorder
        </Button>
        <Link href={`/account/orders/${orderNo}/invoice`} target="_blank">
          <Button variant="outline">
            <FileText className="size-4" /> View Invoice
          </Button>
        </Link>
        {cancellable && !confirming && (
          <Button variant="ghost" onClick={() => setConfirming(true)} disabled={pending} className="text-danger">
            <XCircle className="size-4" /> Cancel order
          </Button>
        )}
      </div>

      {confirming && (
        <div className="rounded-card border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-bold text-ink">Cancel this order? Stock will be immediately released.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="dark" size="sm" onClick={doCancel} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : "Yes, cancel"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
              Keep order
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm font-bold text-danger">{error}</p>}
    </div>
  );
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Razorpay) return resolve();
    const existing = document.getElementById("razorpay-checkout-js");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const s = document.createElement("script");
    s.id = "razorpay-checkout-js";
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("razorpay script failed"));
    document.body.appendChild(s);
  });
}
