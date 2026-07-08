import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Heart, MapPin, Package } from "lucide-react";
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { AccountNav } from "@/components/account/account-nav";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import { createSupabaseServer } from "@/lib/supabase/server";
import { listOrders } from "@/lib/services/orders";
import { listAddresses } from "@/lib/services/addresses";
import { getWishlistProductIds } from "@/lib/services/wishlist";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = { title: "My Account | Vertical Express", robots: { index: false } };

export default async function AccountOverview() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/account");
  const userId = data.user.id;

  const [{ orders, total }, addresses, wishlistIds] = await Promise.all([
    listOrders(userId, 1, 3),
    listAddresses(userId),
    getWishlistProductIds(userId),
  ]);
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight sm:text-3xl">
          Hi, {data.user.email?.split("@")[0]}
        </h1>
        <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
          <AccountNav active="/account" />

          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard icon={Package} label="Orders" value={String(total)} href="/account/orders" />
              <StatCard icon={MapPin} label="Addresses" value={String(addresses.length)} href="/account/addresses" />
              <StatCard icon={Heart} label="Wishlist" value={String(wishlistIds.length)} href="/account/wishlist" />
            </div>

            {/* Recent orders */}
            <section className="rounded-card border border-neutral-100 bg-white p-5 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-widest text-neutral-500">Recent orders</h2>
                <Link href="/account/orders" className="inline-flex items-center gap-1 text-xs font-bold text-brand-deep hover:underline">
                  View all <ArrowRight className="size-3" />
                </Link>
              </div>
              {orders.length === 0 ? (
                <p className="py-4 text-sm font-semibold text-neutral-500">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-neutral-100">
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
              <section className="rounded-card border border-neutral-100 bg-white p-5 shadow-card">
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

function StatCard({ icon: Icon, label, value, href }: { icon: typeof Package; label: string; value: string; href: string }) {
  return (
    <Link href={href} className="rounded-card border border-neutral-100 bg-white p-4 text-center shadow-card transition-shadow hover:shadow-card-hover">
      <Icon className="mx-auto size-5 text-brand-deep" strokeWidth={1.8} aria-hidden />
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">{label}</p>
    </Link>
  );
}
