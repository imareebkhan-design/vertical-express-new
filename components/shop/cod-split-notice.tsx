"use client";

import { Banknote } from "lucide-react";
import { formatPaise } from "@/lib/money";
import { PlaceholderValue } from "@/components/ui/placeholder-value";

/**
 * What paying cash on delivery actually involves when an order splits.
 *
 * An order with both express and heavy lines arrives as two deliveries, on
 * different days, on different vehicles. Paying cash therefore means paying
 * twice — a driver at the door today, a different driver tomorrow — and the
 * customer needs to have the money ready both times.
 *
 * Nothing said so on either surface. Somebody expecting to hand over ₹34,000
 * once was going to be asked for part of it today and the rest tomorrow, which
 * on a building site is how a delivery gets refused at the gate.
 *
 * ON THE AMOUNTS
 *
 * The per-shipment figures are goods totals. Delivery fee and tax are charged
 * on the order, not apportioned per shipment, so quoting an exact cash amount
 * per driver would be a number the customer could hold us to and we would miss.
 * The count of payments is the load-bearing fact; the goods totals give the
 * shape without over-promising.
 */
export function CodSplitNotice({
  shipments,
}: {
  shipments: { sequence: number; itemCount: number; totalPaise: number }[];
}) {
  if (shipments.length < 2) return null;

  return (
    <div className="mt-3 flex items-start gap-3 rounded-[18px] bg-amber-soft p-3.5">
      <Banknote className="mt-0.5 size-[18px] flex-none text-ink" strokeWidth={1.7} aria-hidden />
      <div>
        <p className="text-[13px] font-bold text-ink">
          You&apos;ll pay {shipments.length} drivers, on {shipments.length} different
          deliveries.
        </p>
        <ul className="mt-1.5 space-y-0.5">
          {shipments.map((s) => (
            <li key={s.sequence} className="text-[12px] font-medium leading-[17px] text-ink-700">
              Delivery {s.sequence} — {s.itemCount} item{s.itemCount !== 1 ? "s" : ""},{" "}
              {formatPaise(s.totalPaise)} of goods
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[12px] font-medium leading-[17px] text-ink-700">
          Delivery and tax are charged on the order, so each driver&apos;s figure differs
          slightly from the goods total above.{" "}
          <PlaceholderValue pending="no COD ceiling has been set — owner decision, see CLAUDE.md">
            A per-shipment cash limit may apply.
          </PlaceholderValue>
        </p>
      </div>
    </div>
  );
}
