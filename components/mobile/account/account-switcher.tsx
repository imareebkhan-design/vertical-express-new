"use client";

import React, { useEffect, useState } from "react";
import { useNativeShell } from "@/components/mobile/native-shell-provider";

// Web Components
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { AccountNav } from "@/components/account/account-nav";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import { PageLoader } from "@/components/page-loader";
import { formatPaise } from "@/lib/money";
import { Package, MapPin, Heart, ArrowRight } from "lucide-react";
import Link from "next/link";

// Mobile Components
import { MobileAccountView } from "@/components/mobile/account/mobile-account-view";

interface AccountSwitcherProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orders: any[];
  totalOrders: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addresses: any[];
  wishlistIds: string[];
  email: string | null;
}

export function AccountSwitcher({
  orders,
  totalOrders,
  addresses,
  wishlistIds,
  email,
}: AccountSwitcherProps) {
  const { isNative } = useNativeShell();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <PageLoader />;
  }

  if (isNative) {
    return (
      <MobileAccountView
        ordersCount={totalOrders}
        addressesCount={addresses.length}
        wishlistCount={wishlistIds.length}
        email={email}
        recentOrders={orders}
      />
    );
  }

  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight sm:text-3xl">
          Hi, {email?.split("@")[0]}
        </h1>
        <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
          <AccountNav active="/account" />

          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard icon={Package} label="Orders" value={String(totalOrders)} href="/account/orders" />
              <StatCard icon={MapPin} label="Addresses" value={String(addresses.length)} href="/account/addresses" />
              <StatCard icon={Heart} label="Wishlist" value={String(wishlistIds.length)} href="/account/wishlist" />
            </div>

            {/* Recent orders */}
            <section className="rounded-card border border-hairline-border bg-white p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-widest text-neutral-500">Recent orders</h2>
                <Link href="/account/orders" className="inline-flex items-center gap-1 text-xs font-bold text-brand-deep hover:underline">
                  View all <ArrowRight className="size-3" />
                </Link>
              </div>
              {orders.length === 0 ? (
                <p className="py-4 text-sm font-semibold text-neutral-500">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-hairline-border">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <Link href={`/account/orders/${o.orderNo}`} className="flex items-center justify-between gap-3 py-3 hover:opacity-80">
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold">{o.orderNo}</p>
                          <p className="text-xs font-semibold text-neutral-500">
                            {o.items.length} item{o.items.length > 1 ? "s" : ""} · {formatPaise(o.totalPaise)}
                          </p>
                        </div>
                        <OrderStatusBadge status={o.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Default address */}
            {defaultAddress && (
              <section className="rounded-card border border-hairline-border bg-white p-5 shadow-card">
                <h2 className="mb-2 text-sm font-extrabold uppercase tracking-widest text-neutral-500">Default address</h2>
                <p className="text-sm font-semibold text-neutral-600">
                  <span className="font-extrabold capitalize text-ink">{defaultAddress.label} · {defaultAddress.name}</span>
                  <br />
                  {defaultAddress.line1}, {defaultAddress.city}, {defaultAddress.state} — {defaultAddress.pincode}
                </p>
              </section>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function StatCard({ icon: Icon, label, value, href }: { icon: React.ElementType; label: string; value: string; href: string }) {
  return (
    <Link href={href} className="rounded-card border border-hairline-border bg-white p-4 text-center shadow-card transition-shadow hover:shadow-card-hover">
      <Icon className="mx-auto size-5 text-brand-deep" strokeWidth={1.8} aria-hidden />
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">{label}</p>
    </Link>
  );
}
