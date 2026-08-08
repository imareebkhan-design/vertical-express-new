"use client";

import React, { useEffect, useState } from "react";
import { useNativeShell } from "@/components/mobile/native-shell-provider";

// Web Components
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { AccountNav } from "@/components/account/account-nav";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import { EmptyState } from "@/components/shop/empty-state";
import { PageLoader } from "@/components/page-loader";
import { formatPaise } from "@/lib/money";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

// Mobile Components
import { MobileOrdersView } from "@/components/mobile/account/mobile-orders-view";

interface OrdersSwitcherProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orders: any[];
  page: number;
  pages: number;
}

export function OrdersSwitcher({ orders, page, pages }: OrdersSwitcherProps) {
  const { isNative } = useNativeShell();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <PageLoader />;
  }

  if (isNative) {
    return <MobileOrdersView initialOrders={orders} initialPage={page} totalPages={pages} />;
  }

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight sm:text-3xl">My Orders</h1>
        <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
          <AccountNav active="/account/orders" />

          <div>
            {orders.length === 0 ? (
              <EmptyState
                title="No orders yet"
                caption="When you place an order it'll show up here with live tracking."
                actionLabel="Start shopping"
                actionHref="/categories"
              />
            ) : (
              <ul className="space-y-3">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/account/orders/${o.orderNo}`}
                      className="flex items-center gap-4 rounded-card border border-hairline-border bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover"
                    >
                      <div className="flex -space-x-3">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {o.items.slice(0, 3).map((it: any) => (
                          <span key={it.id} className="size-12 shrink-0 overflow-hidden rounded-lg border-2 border-white bg-tile">
                            {it.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={it.imageUrl} alt="" className="size-full object-contain p-1" />
                            )}
                          </span>
                        ))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-extrabold">{o.orderNo}</p>
                          <OrderStatusBadge status={o.status} />
                        </div>
                        <p className="mt-0.5 text-xs font-semibold text-neutral-500">
                          {new Date(o.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {o.items.reduce((s: number, i: any) => s + i.qty, 0)} items · {formatPaise(o.totalPaise)}
                        </p>
                      </div>
                      <ChevronRight className="size-5 shrink-0 text-neutral-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {pages > 1 && (
              <div className="mt-6 flex justify-center gap-2">
                {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                  <Link
                    key={p}
                    href={`/account/orders?page=${p}`}
                    aria-current={p === page ? "page" : undefined}
                    className={`grid size-10 place-items-center rounded-full text-sm font-extrabold ${
                      p === page ? "bg-brand-deep text-white" : "border border-neutral-200 hover:border-brand-deep"
                    }`}
                  >
                    {p}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
