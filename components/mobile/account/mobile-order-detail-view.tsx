"use client";

import React, { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Clock,
  FileText,
  Loader2,
  XCircle,
  CreditCard,
  Share2,
} from "lucide-react";
import { formatPaise } from "@/lib/money";
import { triggerHaptic } from "@/lib/native/haptics";
import { cancelOrder, retryOrderPayment } from "@/actions/orders";
import { confirmRazorpayPayment } from "@/actions/checkout";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import type { OrderAddressSnapshot } from "@/lib/services/orders";
import { cn } from "@/lib/utils";

interface MobileOrderDetailViewProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any;
}

const TIMELINE = ["confirmed", "packed", "out_for_delivery", "delivered"] as const;
const TIMELINE_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

export function MobileOrderDetailView({ order }: MobileOrderDetailViewProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const addr = order.address as unknown as OrderAddressSnapshot;
  const cancelled = order.status === "cancelled";
  const cancellable = order.status === "pending_payment" || order.status === "confirmed";
  const currentIdx = TIMELINE.indexOf(order.status as (typeof TIMELINE)[number]);
  const isPendingPayment = order.status === "pending_payment";

  // Load Razorpay Script
  const loadRazorpayScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
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
      s.onerror = () => reject(new Error("Razorpay script load failed"));
      document.body.appendChild(s);
    });
  };

  // Launch Razorpay Payment Window
  const openRazorpay = async (
    orderNo: string,
    rzp: { orderId: string; amountPaise: number; keyId: string }
  ) => {
    try {
      await loadRazorpayScript();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Razorpay = (window as any).Razorpay;
      if (!Razorpay) {
        setError("Payment checkout overlay failed to open.");
        return;
      }

      const options = {
        key: rzp.keyId,
        amount: rzp.amountPaise,
        currency: "INR",
        name: "Vertical Express",
        order_id: rzp.orderId,
        theme: { color: "#efc41a" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: async (response: any) => {
          triggerHaptic("medium");
          const confirm = await confirmRazorpayPayment({
            orderNo,
            razorpayOrderId: rzp.orderId,
            razorpayPaymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });

          if (!confirm.ok) {
            setError(confirm.error.message);
            return;
          }
          triggerHaptic("heavy");
          router.refresh();
        },
        modal: {
          ondismiss: () => {
            setError("Payment was closed. Tap Complete Payment to retry.");
          },
        },
      };

      const rz = new Razorpay(options);
      rz.open();
    } catch {
      setError("Payment checkout configuration failed.");
    }
  };

  const handleRetryPayment = () => {
    setError(null);
    triggerHaptic("medium");
    startTransition(async () => {
      const res = await retryOrderPayment(order.orderNo);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }

      if (res.data.razorpay?.orderId && res.data.razorpay.keyId) {
        await openRazorpay(order.orderNo, res.data.razorpay);
      } else {
        router.refresh();
      }
    });
  };

  const handleCancelOrder = () => {
    setError(null);
    triggerHaptic("medium");
    startTransition(async () => {
      const res = await cancelOrder(order.orderNo, "Cancelled by mobile customer");
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setConfirmingCancel(false);
      router.refresh();
    });
  };

  const handleShare = async () => {
    triggerHaptic("light");
    const shareUrl = `${window.location.origin}/account/orders/${order.orderNo}`;
    const { shareContent } = await import("@/lib/native/share");
    await shareContent({
      title: `Order ${order.orderNo}`,
      text: `Track my Vertical Express order ${order.orderNo}! Total: ${formatPaise(order.totalPaise)}`,
      url: shareUrl,
      dialogTitle: "Share Order Details",
    });
  };

  if (!mounted) return <div className="min-h-screen bg-surface" />;

  return (
    <div className="flex flex-col min-h-screen bg-surface pb-24 overflow-x-hidden">
      {/* Sticky Native Header */}
      <div className="native-header sticky top-0 z-30 flex items-center justify-between border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              triggerHaptic("light");
              router.back();
            }}
            className="flex size-9 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35"
          >
            <ArrowLeft className="size-4.5" />
          </button>
          <h1 className="text-base font-extrabold text-ink leading-none">Order Details</h1>
        </div>
        <button
          onClick={handleShare}
          className="flex size-9 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35"
        >
          <Share2 className="size-4.5 text-ink/40" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Error Banner */}
        {error && (
          <div className="rounded-2xl bg-danger/10 p-4 text-xs font-bold text-danger">
            {error}
          </div>
        )}

        {/* Order Header Summary */}
        <div className="rounded-2xl border border-mist/15 bg-white p-4 shadow-2xs flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-ink leading-none">{order.orderNo}</h2>
            <p className="text-[10px] text-ink/40 font-semibold mt-1.5 leading-none">
              Placed {new Date(order.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        {/* Timeline Tracking Stepper */}
        {!cancelled && (
          <div className="rounded-2xl border border-mist/15 bg-white p-5 shadow-2xs space-y-4">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/35 leading-none">
              Order Status
            </h3>
            <ol className="flex items-center justify-between">
              {TIMELINE.map((step, i) => {
                const done = currentIdx >= i;
                return (
                  <li key={step} className="flex flex-1 flex-col items-center text-center">
                    <div className="flex w-full items-center">
                      {i > 0 && <span className={cn("h-0.5 flex-1", currentIdx >= i ? "bg-brand" : "bg-mist/20")} />}
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-extrabold",
                          done ? "bg-brand text-ink" : "bg-mist/20 text-ink/35"
                        )}
                      >
                        {i + 1}
                      </span>
                      {i < TIMELINE.length - 1 && <span className={cn("h-0.5 flex-1", currentIdx > i ? "bg-brand" : "bg-mist/20")} />}
                    </div>
                    <span className={cn("mt-2 text-[9px] font-extrabold", done ? "text-ink" : "text-ink/35")}>
                      {TIMELINE_LABEL[step]}
                    </span>
                  </li>
                );
              })}
            </ol>
            {order.etaMinutes && currentIdx < 3 && (
              <div className="bg-emerald-50 text-emerald-600 rounded-xl p-3 text-xs font-bold text-center flex items-center justify-center gap-1.5">
                <Clock className="size-4 animate-pulse" />
                <span>Estimated delivery in ~{order.etaMinutes} mins</span>
              </div>
            )}
          </div>
        )}

        {cancelled && order.cancelledReason && (
          <div className="rounded-2xl bg-danger/10 p-4 text-xs font-bold text-danger">
            This order was cancelled. Reason: {order.cancelledReason}
          </div>
        )}

        {/* Items detail list */}
        <div className="rounded-2xl border border-mist/15 bg-white p-4 shadow-2xs space-y-4">
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/35 leading-none">
            Items Included
          </h3>
          <ul className="divide-y divide-mist/10">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {order.items.map((item: any) => (
              <li key={item.id} className="py-3 flex gap-3 first:pt-0 last:pb-0">
                <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-mist/5 border border-mist/15">
                  {item.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="size-full object-contain p-1" />
                  )}
                </span>
                <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
                  <p className="line-clamp-1 text-xs font-bold text-ink leading-tight">{item.title}</p>
                  <p className="text-[10px] font-semibold text-ink/45 mt-1 leading-none">
                    {formatPaise(item.unitPricePaise)} × {item.qty}
                  </p>
                </div>
                <span className="text-xs font-extrabold text-ink pt-0.5">{formatPaise(item.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>

          <dl className="space-y-1.5 border-t border-mist/10 pt-3 text-xs font-bold text-ink/80">
            <div className="flex justify-between">
              <dt className="font-semibold text-ink/50">Subtotal</dt>
              <dd>{formatPaise(order.subtotalPaise)}</dd>
            </div>
            {order.taxPaise > 0 && (
              <div className="flex justify-between">
                <dt className="font-semibold text-ink/50">GST (18% inclusive)</dt>
                <dd>{formatPaise(order.taxPaise)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="font-semibold text-ink/50">Delivery Charges</dt>
              <dd className={order.deliveryFeePaise === 0 ? "text-emerald-600" : ""}>
                {order.deliveryFeePaise === 0 ? "FREE" : formatPaise(order.deliveryFeePaise)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-mist/10 pt-2.5 text-sm font-extrabold text-ink">
              <dt>Total Amount</dt>
              <dd className="text-brand-deep">{formatPaise(order.totalPaise)}</dd>
            </div>
          </dl>
          <div className="border-t border-mist/10 pt-3 text-[10px] font-bold text-ink/45">
            Payment Mode: {order.paymentMethod === "cod" ? "Cash on Delivery" : "Online Gateway"}
          </div>
        </div>

        {/* Address snapshot */}
        <div className="rounded-2xl border border-mist/15 bg-white p-4 shadow-2xs flex gap-3 text-left">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-mist/20 text-ink/65">
            <MapPin className="size-4.5" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-extrabold text-ink capitalize">
              {addr.label} · {addr.name}
            </span>
            <p className="text-[11px] font-semibold text-ink/60 mt-1 leading-snug">
              {addr.line1}
              {addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}, {addr.state} — {addr.pincode}
              <br />
              Phone: {addr.phone}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-2 pt-2">
          {/* Payment retry banner */}
          {isPendingPayment && (
            <button
              onClick={handleRetryPayment}
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-deep py-3 text-xs font-extrabold text-white shadow-xs active:scale-[0.98]"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
              <span>Complete Payment</span>
            </button>
          )}

          {/* View Invoice */}
          <Link
            href={`/account/orders/${order.orderNo}/invoice`}
            target="_blank"
            onClick={() => triggerHaptic("light")}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-mist/20 py-3 text-xs font-extrabold text-ink bg-white active:bg-mist/5"
          >
            <FileText className="size-4 text-ink/65" />
            <span>Download Invoice</span>
          </Link>

          {/* Cancel Trigger */}
          {cancellable && !confirmingCancel && (
            <button
              onClick={() => {
                triggerHaptic("light");
                setConfirmingCancel(true);
              }}
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-danger/30 py-3 text-xs font-extrabold text-danger bg-white active:bg-danger/5"
            >
              <XCircle className="size-4" />
              <span>Cancel Order</span>
            </button>
          )}

          {/* Cancellation Confirm Panel */}
          {confirmingCancel && (
            <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4 space-y-3">
              <p className="text-xs font-bold text-ink leading-relaxed">
                Confirm order cancellation? Materials stock will be released instantly.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCancelOrder}
                  disabled={pending}
                  className="flex-1 rounded-xl bg-danger py-2 px-4 text-xs font-extrabold text-white active:scale-95 disabled:opacity-50"
                >
                  {pending ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Cancel Order"}
                </button>
                <button
                  onClick={() => setConfirmingCancel(false)}
                  disabled={pending}
                  className="flex-1 rounded-xl border border-mist/20 bg-white py-2 px-4 text-xs font-extrabold text-ink active:scale-95"
                >
                  Keep Order
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
