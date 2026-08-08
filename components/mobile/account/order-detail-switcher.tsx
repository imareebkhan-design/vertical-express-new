"use client";

import React, { useEffect, useState } from "react";
import { useNativeShell } from "@/components/mobile/native-shell-provider";

// Web Components
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import { OrderActions } from "@/components/account/order-actions";
import { PageLoader } from "@/components/page-loader";
import { formatPaise } from "@/lib/money";
import type { OrderAddressSnapshot } from "@/lib/services/orders";
import { ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";

// Mobile Components
import { MobileOrderDetailView } from "@/components/mobile/account/mobile-order-detail-view";

const TIMELINE = ["confirmed", "packed", "out_for_delivery", "delivered"] as const;
const TIMELINE_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

interface OrderDetailSwitcherProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any;
}

export function OrderDetailSwitcher({ order }: OrderDetailSwitcherProps) {
  const { isNative } = useNativeShell();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <PageLoader />;
  }

  if (isNative) {
    return <MobileOrderDetailView order={order} />;
  }

  const addr = order.address as unknown as OrderAddressSnapshot;
  const cancelled = order.status === "cancelled";
  const cancellable = order.status === "pending_payment" || order.status === "confirmed";
  const currentIdx = TIMELINE.indexOf(order.status as (typeof TIMELINE)[number]);

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs font-bold text-neutral-500">
          <Link href="/account/orders" className="hover:text-ink">My Orders</Link>
          <ChevronRight className="size-3" aria-hidden />
          <span className="text-ink">{order.orderNo}</span>
        </nav>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{order.orderNo}</h1>
            <p className="mt-1 text-sm font-semibold text-neutral-500">
              Placed {new Date(order.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        {/* Timeline */}
        {!cancelled && (
          <div className="mb-8 rounded-card border border-neutral-100 bg-white p-5 shadow-card">
            <ol className="flex items-center justify-between">
              {TIMELINE.map((step, i) => {
                const done = currentIdx >= i;
                return (
                  <li key={step} className="flex flex-1 flex-col items-center text-center">
                    <div className="flex w-full items-center">
                      {i > 0 && <span className={`h-0.5 flex-1 ${currentIdx >= i ? "bg-brand" : "bg-neutral-200"}`} />}
                      <span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-extrabold ${done ? "bg-brand text-ink" : "bg-neutral-100 text-neutral-400"}`}>
                        {i + 1}
                      </span>
                      {i < TIMELINE.length - 1 && <span className={`h-0.5 flex-1 ${currentIdx > i ? "bg-brand" : "bg-neutral-200"}`} />}
                    </div>
                    <span className={`mt-2 text-[11px] font-bold ${done ? "text-ink" : "text-neutral-400"}`}>
                      {TIMELINE_LABEL[step]}
                    </span>
                  </li>
                );
              })}
            </ol>
            {order.etaMinutes && currentIdx < 3 && (
              <p className="mt-4 text-center text-sm font-bold text-success">Estimated delivery in ~{order.etaMinutes} min</p>
            )}
          </div>
        )}

        {cancelled && order.cancelledReason && (
          <div className="mb-8 rounded-card border border-neutral-200 bg-surface/60 p-4 text-sm font-bold text-neutral-600">
            This order was cancelled. {order.cancelledReason}
          </div>
        )}

        {/* Items */}
        <div className="rounded-card border border-neutral-100 bg-white p-5 shadow-card">
          <h2 className="mb-4 text-sm font-extrabold uppercase tracking-widest text-neutral-500">Items</h2>
          <ul className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {order.items.map((item: any) => (
              <li key={item.id} className="flex gap-3">
                <span className="size-14 shrink-0 overflow-hidden rounded-lg bg-tile">
                  {item.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.title} className="size-full object-contain p-1.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-extrabold">{item.title}</p>
                  <p className="text-xs font-semibold text-neutral-500">{formatPaise(item.unitPricePaise)} × {item.qty}</p>
                </div>
                <span className="text-sm font-extrabold">{formatPaise(item.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 border-t border-neutral-100 pt-4 text-sm font-bold">
            <div className="flex justify-between"><dt className="text-neutral-500">Subtotal</dt><dd>{formatPaise(order.subtotalPaise)}</dd></div>
            <div className="flex justify-between"><dt className="text-neutral-500">Delivery</dt><dd className={order.deliveryFeePaise === 0 ? "text-success" : ""}>{order.deliveryFeePaise === 0 ? "FREE" : formatPaise(order.deliveryFeePaise)}</dd></div>
            <div className="flex justify-between border-t border-neutral-100 pt-1.5 text-base font-extrabold"><dt>Total</dt><dd>{formatPaise(order.totalPaise)}</dd></div>
          </dl>
          <p className="mt-3 text-xs font-bold text-neutral-500">
            Payment: {order.paymentMethod === "cod" ? "Pay on delivery" : "Paid online"}
          </p>
        </div>

        {/* Address */}
        <div className="mt-4 flex items-start gap-2 rounded-card border border-neutral-100 bg-white p-4 shadow-card">
          <MapPin className="mt-0.5 size-4 shrink-0 text-brand-deep" aria-hidden />
          <p className="text-sm font-semibold text-neutral-600">
            <span className="font-extrabold capitalize text-ink">{addr.label} · {addr.name}</span>
            <br />
            {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}, {addr.state} — {addr.pincode}
            <br />{addr.phone}
          </p>
        </div>

        <div className="mt-6">
          <OrderActions orderNo={order.orderNo} cancellable={cancellable} status={order.status} />
        </div>
      </main>
      <Footer />
    </>
  );
}
