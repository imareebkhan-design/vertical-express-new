"use client";

import React from "react";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";

// Web Components
import { Navbar } from "@/components/sections/navbar";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
import { Footer } from "@/components/sections/footer";
import { AccountNav } from "@/components/account/account-nav";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import { PageLoader } from "@/components/page-loader";
import { formatPaise } from "@/lib/money";
import { itemCountLabel } from "@/lib/order-display";
import { Package, MapPin, Heart, ArrowRight, Pencil, UserRound } from "lucide-react";
import Link from "next/link";

// Mobile Components
import { MobileAccountView } from "@/components/mobile/account/mobile-account-view";
import type { EditableProfile } from "@/actions/profile";
import { buyerTypeLabel } from "@/components/account/profile-form";

interface AccountSwitcherProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orders: any[];
  totalOrders: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addresses: any[];
  wishlistIds: string[];
  email: string | null;
  /** The market signs in by phone, so this is the usual identity, not email. */
  phone: string | null;
  profile: EditableProfile;
}

export function AccountSwitcher({
  orders,
  totalOrders,
  addresses,
  wishlistIds,
  email,
  phone,
  profile,
}: AccountSwitcherProps) {
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);

  if (!ready) {
    return <PageLoader />;
  }

  if (isMobile) {
    return (
      <MobileAccountView
        ordersCount={totalOrders}
        addressesCount={addresses.length}
        sites={addresses}
        wishlistCount={wishlistIds.length}
        email={email}
        phone={phone}
        fullName={profile.fullName}
        recentOrders={orders}
      />
    );
  }

  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];

  return (
    <>
      <Navbar />
      <main id="main-content" className="mx-auto max-w-[1200px] px-6 py-8">
        <h1 className="mb-6 text-3xl font-extrabold tracking-[-0.03em] text-ink sm:text-4xl">
          Account
        </h1>
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <AccountNav active="/account" />

          <div className="space-y-6">
            {/* The artboard's profile card: who this account is, with Edit. */}
            <section className="flex items-center gap-5 rounded-[26px] border border-line bg-paper p-6 shadow-card">
              <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full bg-amber-soft text-xl font-extrabold text-ink">
                {initialsOf(profile.fullName) ?? <UserRound className="size-6" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold text-ink">{profile.fullName ?? "Add your name"}</p>
                <p className="mt-0.5 text-sm font-medium text-ink-700">{[phone, email].filter(Boolean).join(" · ") || "Signed in"}</p>
                {buyerTypeLabel(profile.buyerType) ? (
                  <p className="mt-2 inline-block rounded-full bg-chip-soft px-3 py-1 text-xs font-bold text-ink">
                    {buyerTypeLabel(profile.buyerType)}
                  </p>
                ) : null}
              </div>
              <EditPill label="Edit your details" />
            </section>

            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard icon={Package} label="Orders" value={String(totalOrders)} href="/account/orders" />
              <StatCard icon={MapPin} label="Addresses" value={String(addresses.length)} href="/account/addresses" />
              <StatCard icon={Heart} label="Wishlist" value={String(wishlistIds.length)} href="/account/wishlist" />
            </div>

            {/* Recent orders */}
            <section className="rounded-[26px] border border-line bg-paper p-6 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-widest text-ink-500">Recent orders</h2>
                <Link href="/account/orders" className="inline-flex items-center gap-1 text-xs font-bold text-ink hover:underline no-underline">
                  View all <ArrowRight className="size-3" />
                </Link>
              </div>
              {orders.length === 0 ? (
                <p className="py-4 text-sm font-semibold text-ink-500">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <Link href={`/account/orders/${o.orderNo}`} className="flex items-center justify-between gap-3 py-3.5 hover:opacity-80 no-underline">
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-ink">{o.orderNo}</p>
                          <p className="text-xs font-semibold text-ink-500">
                            {itemCountLabel(o.items)} · {formatPaise(o.totalPaise)}
                          </p>
                        </div>
                        <OrderStatusBadge status={o.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* The artboard's "Business & GST" card. Its line "Every invoice
                carries it" is not carried over: no invoice holds a customer
                GSTIN today (no Order.gstin). */}
            <section className="rounded-[26px] border border-line bg-paper p-6 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-widest text-ink-500">Business &amp; GST</h2>
                <EditPill label="Edit business and GST details" />
              </div>
              {profile.companyName || profile.gstin ? (
                <p className="text-sm font-medium text-ink-700">
                  {profile.companyName ? <span className="font-extrabold text-ink">{profile.companyName}</span> : null}
                  {profile.companyName && profile.gstin ? <br /> : null}
                  {profile.gstin ? <>GSTIN <span className="font-bold tabular-nums text-ink">{profile.gstin}</span></> : null}
                </p>
              ) : (
                <p className="text-sm font-medium text-ink-500">No business details added.</p>
              )}
            </section>

            {/* Default address */}
            {defaultAddress && (
              <section className="rounded-[26px] border border-line bg-paper p-6 shadow-card">
                <h2 className="mb-2 text-sm font-extrabold uppercase tracking-widest text-ink-500">Default address</h2>
                <p className="text-sm font-medium text-ink-700">
                  <span className="font-extrabold capitalize text-ink">{defaultAddress.label} · {defaultAddress.name}</span>
                  <br />
                  {defaultAddress.line1}, {defaultAddress.city}, {defaultAddress.state} — {defaultAddress.pincode}
                </p>
              </section>
            )}
          </div>
        </div>

        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}

function StatCard({ icon: Icon, label, value, href }: { icon: React.ElementType; label: string; value: string; href: string }) {
  return (
    <Link href={href} className="rounded-[22px] border border-line bg-paper p-4 text-center shadow-card transition-shadow hover:shadow-card-hover no-underline">
      <Icon className="mx-auto size-5 text-ink" strokeWidth={1.8} aria-hidden />
      <p className="mt-1 text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">{label}</p>
    </Link>
  );
}

/* The artboard's Edit control: a pill with a pencil, not a bare text link. */
function EditPill({ label }: { label: string }) {
  return (
    <Link
      href="/account/profile"
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-chip-soft px-3.5 py-2 text-xs font-bold text-ink no-underline transition-colors hover:bg-hush"
    >
      <Pencil className="size-3.5" aria-hidden />
      Edit
    </Link>
  );
}

/** "Bilal Ahmad" → "BA"; null when there is no name to take them from. */
function initialsOf(name: string | null): string | null {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
