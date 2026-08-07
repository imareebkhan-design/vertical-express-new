"use client";

import { Wallet, ArrowDownRight, ArrowUpRight, Clock, ShieldCheck } from "lucide-react";
import { formatPaise } from "@/lib/money";

interface Transaction {
  id: string;
  amountPaise: number;
  type: string;
  description: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

interface WalletViewProps {
  balancePaise: number;
  transactions: Transaction[];
}

export function WalletView({ balancePaise, transactions }: WalletViewProps) {
  return (
    <div className="space-y-6">
      {/* Wallet Balance Banner */}
      <div className="rounded-card border border-hairline-border bg-brand-deep p-6 text-white shadow-card">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-full bg-white/10 text-brand">
            <Wallet className="size-6" />
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-neutral-300">
              Cashback Wallet Balance
            </p>
            <p className="text-3xl font-extrabold text-brand">{formatPaise(balancePaise)}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-4 text-xs font-semibold text-neutral-300">
          <span className="flex items-center gap-1">
            <ShieldCheck className="size-4 text-brand" /> 5% Cashback auto-earned on delivered orders
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-4 text-brand" /> Valid for 30 days
          </span>
        </div>
      </div>

      {/* Transaction History */}
      <div className="rounded-card border border-hairline-border bg-white p-5 shadow-card">
        <h2 className="mb-4 text-base font-extrabold">Transaction History</h2>

        {transactions.length === 0 ? (
          <p className="py-6 text-center text-sm font-semibold text-neutral-500">
            No wallet transactions yet. Place an order to earn 5% cashback!
          </p>
        ) : (
          <ul className="divide-y divide-hairline-border">
            {transactions.map((tx) => {
              const isCredit = tx.amountPaise > 0;
              return (
                <li key={tx.id} className="flex items-center justify-between py-3.5">
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${
                        isCredit ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                      }`}
                    >
                      {isCredit ? (
                        <ArrowDownRight className="size-4" />
                      ) : (
                        <ArrowUpRight className="size-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-ink">
                        {tx.description ?? (isCredit ? "Cashback Credited" : "Wallet Debit")}
                      </p>
                      <p className="text-xs font-semibold text-neutral-400">
                        {new Date(tx.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {tx.expiresAt && (
                          <span className="ml-2 text-neutral-500">
                            · Expires: {new Date(tx.expiresAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-extrabold ${
                      isCredit ? "text-success" : "text-ink"
                    }`}
                  >
                    {isCredit ? "+" : ""}{formatPaise(tx.amountPaise)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
