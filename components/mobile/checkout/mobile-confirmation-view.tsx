"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Wallet, Package, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { formatPaise } from "@/lib/money";
import { triggerHaptic } from "@/lib/native/haptics";
import type { OrderAddressSnapshot } from "@/lib/services/orders";

interface MobileConfirmationViewProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any;
}

export function MobileConfirmationView({ order }: MobileConfirmationViewProps) {
  useEffect(() => {
    // Fire success haptic on load
    triggerHaptic("heavy");
  }, []);

  const addr = order.address as unknown as OrderAddressSnapshot;
  const isCod = order.paymentMethod === "cod";

  return (
    <div className="flex flex-col min-h-screen bg-surface pb-24 overflow-x-hidden">
      {/* Top Sticky Safe Header */}
      <div className="native-header sticky top-0 z-30 flex items-center justify-center border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md shadow-xs">
        <h1 className="text-sm font-extrabold text-ink tracking-wide">Order Confirmation</h1>
      </div>

      <div className="p-4 space-y-4">
        {/* Animated Check Circle */}
        <div className="text-center py-6 bg-white rounded-2xl border border-mist/15 shadow-2xs">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 180, damping: 15 }}
            className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-4"
          >
            <CheckCircle2 className="size-10" strokeWidth={2} />
          </motion.div>
          
          <h2 className="text-lg font-extrabold text-ink leading-tight">Order confirmed!</h2>
          <p className="mt-1 text-xs font-semibold text-ink/50 leading-none">
            Order <span className="font-extrabold text-ink">{order.orderNo}</span>
          </p>
          <span className="inline-block mt-3 rounded-full bg-brand-deep/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-brand-deep leading-none">
            {isCod ? "Pay on delivery" : "Payment received"}
          </span>
        </div>

        {/* ETA & Items Summary boxes */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { icon: Clock, label: "ETA", value: order.etaMinutes ? `~${order.etaMinutes} min` : "Soon" },
            { icon: Wallet, label: "Paid", value: isCod ? "On delivery" : formatPaise(order.totalPaise) },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { icon: Package, label: "Items", value: String(order.items.reduce((s: number, i: any) => s + i.qty, 0)) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-2xl border border-mist/15 bg-white p-3 shadow-2xs">
              <Icon className="mx-auto size-4.5 text-brand-deep" strokeWidth={1.8} />
              <p className="mt-1 text-[8px] font-extrabold uppercase tracking-wider text-ink/35">{label}</p>
              <p className="text-xs font-extrabold text-ink mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Order Details list */}
        <div className="rounded-2xl border border-mist/15 bg-white p-4 shadow-2xs space-y-4">
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 leading-none">
            Order details
          </h3>

          <ul className="divide-y divide-mist/10">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {order.items.map((item: any) => (
              <li key={item.id} className="py-3 flex gap-3 first:pt-0 last:pb-0">
                <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-mist/5 border border-mist/15">
                  {item.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.title} className="size-full object-contain p-1" />
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
        </div>

        {/* Address snapshot panel */}
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

        {/* CTAs */}
        <div className="flex flex-col gap-2 pt-4">
          <Link
            href="/account/orders"
            onClick={() => triggerHaptic("light")}
            className="w-full rounded-xl bg-brand-deep py-3.5 text-xs font-extrabold text-white text-center shadow-md active:scale-[0.98]"
          >
            View My Orders
          </Link>
          <Link
            href="/"
            onClick={() => triggerHaptic("light")}
            className="w-full rounded-xl border border-mist/30 py-3.5 text-xs font-extrabold text-ink text-center active:bg-mist/10"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
