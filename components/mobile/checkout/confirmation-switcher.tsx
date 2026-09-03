"use client";

import React from "react";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";

// Web Components
import { Navbar } from "@/components/sections/navbar";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
import { Footer } from "@/components/sections/footer";
import { PageLoader } from "@/components/page-loader";
import { CheckCircle2, Clock, MapPin, Package, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import type { OrderAddressSnapshot } from "@/lib/services/orders";
import Link from "next/link";

// Mobile Components
import { MobileConfirmationView } from "@/components/mobile/checkout/mobile-confirmation-view";

interface ConfirmationSwitcherProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any;
}

export function ConfirmationSwitcher({ order }: ConfirmationSwitcherProps) {
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);

  if (!ready) {
    return <PageLoader />;
  }

  if (isMobile) {
    return <MobileConfirmationView order={order} />;
  }

  const addr = order.address as unknown as OrderAddressSnapshot;
  const isCod = order.paymentMethod === "cod";

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-[1200px] px-6 py-10">
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
            <CheckCircle2 className="mx-auto size-16 text-success" strokeWidth={1.5} aria-hidden />
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Order placed.</h1>
            <p className="mt-1 text-sm font-semibold text-ink-500">
              Order <span className="font-extrabold text-ink">#{order.orderNo}</span> ·{" "}
              {isCod ? "Pay on delivery" : "Payment received"}
            </p>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-3 text-center">
            {[
              /* "Soon" was the fallback. The guard was right — 0 does not print as a
               time — but the word is still a commitment, and 0 means an operator
               set no promise for this pincode. */
            { icon: Clock, label: "ETA", value: order.etaMinutes ? `~${order.etaMinutes} min` : "Not scheduled yet" },
              { icon: Wallet, label: "Paid", value: isCod ? "On delivery" : formatPaise(order.totalPaise) },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { icon: Package, label: "Items", value: String(order.items.reduce((s: number, i: any) => s + i.qty, 0)) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-[20px] bg-chip-soft p-4 border border-line">
                <Icon className="mx-auto size-5 text-ink" strokeWidth={1.8} aria-hidden />
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">{label}</p>
                <p className="text-sm font-extrabold text-ink">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-[26px] border border-line bg-paper p-6 shadow-card">
            <h2 className="mb-4 text-sm font-extrabold uppercase tracking-widest text-ink-500">Order details</h2>
            <ul className="space-y-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {order.items.map((item: any) => (
                <li key={item.id} className="flex gap-3">
                  <span className="size-14 shrink-0 overflow-hidden rounded-[14px] bg-civil-soft border border-line">
                    {item.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.title} className="size-full object-contain p-1.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-extrabold text-ink">{item.title}</p>
                    <p className="text-xs font-semibold text-ink-500">
                      {formatPaise(item.unitPricePaise)} × {item.qty}
                    </p>
                  </div>
                  <span className="text-sm font-extrabold text-ink">{formatPaise(item.lineTotalPaise)}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-[13.5px] font-bold">
              <div className="flex justify-between">
                <dt className="text-ink-500">Subtotal</dt>
                <dd className="text-ink">{formatPaise(order.subtotalPaise)}</dd>
              </div>
              {order.taxPaise > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-500">GST (18%)</dt>
                  <dd className="text-ink">{formatPaise(order.taxPaise)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-500">Delivery</dt>
                <dd className={order.deliveryFeePaise === 0 ? "text-success" : "text-ink"}>
                  {order.deliveryFeePaise === 0 ? "FREE" : formatPaise(order.deliveryFeePaise)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold">
                <dt className="text-ink">Total</dt>
                <dd className="text-ink">{formatPaise(order.totalPaise)}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-[22px] border border-line bg-paper p-5 shadow-card">
            <MapPin className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />
            <p className="text-[13.5px] font-medium text-ink-700">
              <span className="font-extrabold text-ink capitalize">{addr.label} · {addr.name}</span>
              <br />
              {addr.line1}
              {addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}, {addr.state} — {addr.pincode}
              <br />
              {addr.phone}
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/account/orders" className="flex-1 no-underline">
              <Button size="lg" className="w-full h-12 rounded-full font-bold">View my orders</Button>
            </Link>
            <Link href="/categories" className="flex-1 no-underline">
              <Button size="lg" variant="outline" className="w-full h-12 rounded-full font-bold">Continue shopping</Button>
            </Link>
          </div>
        </div>

        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}

