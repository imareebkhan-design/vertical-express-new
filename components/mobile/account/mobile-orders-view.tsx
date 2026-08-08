"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw, ChevronRight, Package, Calendar } from "lucide-react";
import { formatPaise } from "@/lib/money";
import { triggerHaptic } from "@/lib/native/haptics";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import { cn } from "@/lib/utils";

interface MobileOrdersViewProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialOrders: any[];
  initialPage: number;
  totalPages: number;
}

type OrderTab = "active" | "delivered" | "cancelled";

const ACTIVE_STATUSES = ["pending_payment", "confirmed", "packed", "out_for_delivery"];

export function MobileOrdersView({ initialOrders, initialPage, totalPages }: MobileOrdersViewProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<OrderTab>("active");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRefresh = () => {
    triggerHaptic("medium");
    setRefreshing(true);
    router.refresh();
    setTimeout(() => {
      setRefreshing(false);
      triggerHaptic("light");
    }, 1000);
  };

  const handleTabChange = (tab: OrderTab) => {
    triggerHaptic("light");
    setActiveTab(tab);
  };

  if (!mounted) return <div className="min-h-screen bg-surface" />;

  // Filter orders based on active tab
  const filteredOrders = initialOrders.filter((order) => {
    if (activeTab === "active") {
      return ACTIVE_STATUSES.includes(order.status);
    } else if (activeTab === "delivered") {
      return order.status === "delivered";
    } else {
      return order.status === "cancelled";
    }
  });

  return (
    <div className="flex flex-col min-h-screen bg-surface pb-16 overflow-x-hidden">
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
          <h1 className="text-base font-extrabold text-ink leading-none">My Orders</h1>
        </div>
        <button
          onClick={handleRefresh}
          className={cn(
            "flex size-8 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35",
            refreshing ? "animate-spin text-brand-deep" : ""
          )}
          title="Refresh List"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      {/* Tab Selectors */}
      <div className="flex border-b border-mist/10 bg-white px-2 py-1 sticky top-[calc(env(safe-area-inset-top,12px)+48px)] z-20 shadow-2xs">
        {(["active", "delivered", "cancelled"] as OrderTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={cn(
              "flex-1 py-3 text-xs font-extrabold text-center border-b-2 transition-all capitalize leading-none",
              activeTab === tab
                ? "border-brand-deep text-brand-deep"
                : "border-transparent text-ink/45 hover:text-ink/65"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Orders List Content */}
      <div className="flex-1 p-4">
        {filteredOrders.length === 0 ? (
          <div className="rounded-2xl border border-mist/15 bg-white p-12 text-center shadow-2xs flex flex-col items-center justify-center min-h-[40vh]">
            <Package className="size-12 text-ink/15 mb-3" strokeWidth={1.2} />
            <h3 className="text-sm font-extrabold text-ink">No orders found</h3>
            <p className="text-[11px] text-ink/40 font-semibold mt-1 max-w-xs mx-auto leading-relaxed">
              There are no orders listed under this category at the moment.
            </p>
            <Link
              href="/categories"
              onClick={() => triggerHaptic("light")}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-deep px-6 py-2.5 text-xs font-extrabold text-white shadow-xs active:scale-95"
            >
              Browse items
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-mist/15 bg-white p-4 shadow-2xs">
                <Link
                  href={`/account/orders/${order.orderNo}`}
                  onClick={() => triggerHaptic("light")}
                  className="block space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-extrabold text-ink">{order.orderNo}</span>
                    <OrderStatusBadge status={order.status} />
                  </div>

                  <div className="flex -space-x-2.5 overflow-hidden py-1">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {order.items.slice(0, 4).map((it: any) => (
                      <span
                        key={it.id}
                        className="size-11 shrink-0 overflow-hidden rounded-lg border-2 border-white bg-mist/5 shadow-2xs relative"
                      >
                        {it.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.imageUrl} alt="" className="size-full object-contain p-1" />
                        )}
                      </span>
                    ))}
                    {order.items.length > 4 && (
                      <div className="size-11 rounded-lg border-2 border-white bg-mist/20 flex items-center justify-center text-[10px] font-extrabold text-ink/65 z-10">
                        +{order.items.length - 4}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-mist/10 pt-3 text-[10px] font-semibold text-ink/45">
                    <div className="flex items-center gap-1">
                      <Calendar className="size-3.5" />
                      <span>
                        {new Date(order.placedAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-bold text-ink">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <span>{order.items.reduce((s: number, i: any) => s + i.qty, 0)} items</span>
                      <span className="size-1 rounded-full bg-mist/30" />
                      <span className="text-brand-deep">{formatPaise(order.totalPaise)}</span>
                      <ChevronRight className="size-4 text-ink/30 ml-0.5" />
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Paginator */}
        {totalPages > 1 && (
          <div className="mt-6 flex justify-center gap-2 pb-6">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
              const isCurrent = p === initialPage;
              return (
                <button
                  key={p}
                  onClick={() => {
                    triggerHaptic("light");
                    router.push(`/account/orders?page=${p}`);
                  }}
                  className={cn(
                    "grid size-9 place-items-center rounded-full text-xs font-extrabold transition-all border",
                    isCurrent
                      ? "bg-brand-deep text-white border-brand-deep shadow-xs"
                      : "border-mist/25 bg-white text-ink/65 active:bg-mist/10"
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
