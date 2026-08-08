"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Wallet, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { formatPaise } from "@/lib/money";
import { triggerHaptic } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";

interface MobileWalletViewProps {
  balancePaise: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactions: any[];
}

export function MobileWalletView({ balancePaise, transactions }: MobileWalletViewProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
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

  if (!mounted) return <div className="min-h-screen bg-surface" />;

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
          <h1 className="text-base font-extrabold text-ink leading-none">My Wallet</h1>
        </div>
        <button
          onClick={handleRefresh}
          className={cn(
            "flex size-8 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35",
            refreshing ? "animate-spin text-brand-deep" : ""
          )}
          title="Refresh Balance"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Wallet Balance Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-deep via-brand to-brand-light p-6 text-white shadow-md">
          <div className="absolute -right-6 -top-6 opacity-10">
            <Wallet className="size-36 text-white" />
          </div>

          <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/70 block leading-none">
            Cashback Balance
          </span>
          <span className="text-2xl font-extrabold mt-3.5 block leading-none">
            {formatPaise(balancePaise)}
          </span>
          <span className="text-[9px] font-bold text-white/80 mt-2 block">
            5% cashback credited on every delivered order
          </span>
        </div>

        {/* History section */}
        <div className="rounded-2xl border border-mist/15 bg-white p-4 shadow-2xs space-y-4">
          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-ink/40 leading-none">
            Transaction History
          </h3>

          {transactions.length === 0 ? (
            <div className="py-12 text-center text-xs font-bold text-ink/45">
              No transactions found.
            </div>
          ) : (
            <ul className="divide-y divide-mist/10">
              {transactions.map((t) => {
                const isCredit = t.type === "credit";
                return (
                  <li key={t.id} className="py-3.5 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex size-8.5 shrink-0 items-center justify-center rounded-lg",
                          isCredit ? "bg-emerald-50 text-emerald-600" : "bg-brand-deep/10 text-brand-deep"
                        )}
                      >
                        {isCredit ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-ink truncate leading-tight">
                          {t.description || (isCredit ? "Order Cashback Credited" : "Cashback Discount Applied")}
                        </p>
                        <span className="text-[8px] text-ink/35 font-semibold mt-1 block">
                          {new Date(t.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>

                    <span className={cn("text-xs font-extrabold", isCredit ? "text-emerald-600" : "text-brand-deep")}>
                      {isCredit ? "+" : "-"}
                      {formatPaise(t.amountPaise)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
