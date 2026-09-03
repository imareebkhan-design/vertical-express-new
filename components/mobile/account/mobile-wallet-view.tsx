"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { formatPaise } from "@/lib/money";
import { triggerHaptic } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";
import { PlaceholderValue } from "@/components/ui/placeholder-value";
import { isWalletCredit } from "@/lib/wallet-tx";

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
        {/*
          Vertical Credit — artboard 17.

          The artboard labels this block "Terms unconfirmed" itself, which is the
          design's own placeholder register being applied at the source. So every
          figure here carries the marker: there is no credit model, no limit, no
          repayment window and no policy deciding any of them. Rendering the
          block keeps the screen the design intends and keeps the open question
          visible; inventing a limit would put a number in front of a contractor
          that nobody has agreed to honour.
        */}
        <div className="rounded-[22px] bg-paper p-5 shadow-card">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-extrabold text-ink">Vertical Credit</h2>
            <span className="rounded-full bg-amber-soft px-2.5 py-1 text-[10px] font-bold text-ink">
              Terms unconfirmed
            </span>
          </div>
          <p className="mt-3 text-[13px] font-medium leading-[18px] text-ink-700">
            <PlaceholderValue pending="credit terms are on the do-not-build list — no limit, window or rate has been set">
              A trade credit line is planned, and its limit and repayment terms are not
              settled yet.
            </PlaceholderValue>
          </p>
        </div>

        {/*
          Wallet balance.

          This replaced a card that read "5% cashback credited on every delivered
          order". No cashback policy exists — that was a standing commitment about
          money, invented in a component, and a customer who read it and did not
          receive it would have been right to complain. The balance is real; the
          promise about how it grows was not.
        */}
        <div className="rounded-[22px] bg-paper p-5 shadow-card">
          <span className="block text-[11px] font-bold uppercase tracking-[0.09em] text-ink-500">
            Wallet balance
          </span>
          <span className="mt-2 block text-[28px] font-extrabold leading-8 tracking-[-0.025em] text-ink">
            {formatPaise(balancePaise)}
          </span>
          {/*
            "Add money" stays disabled, and this says why rather than leaving a
            dead button on the screen.

            Three things have to be true before a customer can put money in, and
            none of them is: there is no top-up transaction type (the wallet
            records cashback, order spend, refunds and expiry — nothing for
            money paid in), the wallet is not wired into checkout so a balance
            could not be spent once it existed, and the live gateway is the
            dummy one, which would take no money while reporting that it had.

            That last is ISS-002 and it is why this is not a button waiting on a
            afternoon's work. Crediting a wallet against a payment that never
            happened is the same defect as confirming an order against one.
          */}
          <button
            type="button"
            disabled
            aria-describedby="topup-blocked"
            className="mt-4 h-11 w-full rounded-full bg-chip text-[14px] font-bold text-ink-500"
          >
            Add money
          </button>
          <p id="topup-blocked" className="mt-2 text-[11px] font-medium leading-[15px] text-ink-500">
            Not available yet. Money added here could not be spent — the wallet is not
            connected to checkout — and no live payment gateway is configured to take it.
          </p>
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
                const isCredit = isWalletCredit(t.type);
                return (
                  <li key={t.id} className="py-3.5 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex size-8.5 shrink-0 items-center justify-center rounded-lg",
                          isCredit ? "bg-amber-soft text-ink" : "bg-chip text-ink-700"
                        )}
                      >
                        {isCredit ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-ink truncate leading-tight">
                          {/* The artboard's row label is "Money added to wallet".
                              No transaction can carry it: there is no top-up
                              type, so every credit here is cashback or a refund.
                              Saying "credited" describes what actually
                              happened. */}
                          {t.description || (isCredit ? "Credited to wallet" : "Used on an order")}
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

                    <span className={cn("text-xs font-extrabold", isCredit ? "text-ink" : "text-ink-700")}>
                      {isCredit ? "+" : "\u2212"}
                      {formatPaise(Math.abs(t.amountPaise))}
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
