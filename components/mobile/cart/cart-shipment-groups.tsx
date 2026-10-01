"use client";

import Image from "next/image";
import { Trash2 } from "lucide-react";
import { SpeedChip } from "@/components/ui/speed-chip";
import { formatPaise } from "@/lib/money";
import type { CartShipment } from "@/lib/cart-shipments";
import type { CartLine } from "@/lib/services/cart";

interface CartShipmentGroupsProps {
  /** `groupCartByShipment(summary.lines)` — the split checkout will persist. */
  shipments: CartShipment<CartLine>[];
  /** Units in the cart, for the lead line. */
  count: number;
  pending: boolean;
  onDecrease: (itemId: string, qty: number) => void;
  onIncrease: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
}

/**
 * The phone-web cart's lines, one card per shipment (W-18).
 *
 * The desktop cart and both checkouts already showed the split; the phone
 * showed one list for a basket that would arrive as two deliveries. Grouping
 * comes from the same rule checkout persists, and the wording is the desktop
 * cart's, so a basket reads the same at any width. No delivery time is stated
 * for either shipment — none exists yet.
 */
export function CartShipmentGroups({
  shipments,
  count,
  pending,
  onDecrease,
  onIncrease,
  onRemove,
}: CartShipmentGroupsProps) {
  const total = shipments.length;
  return (
    <div className="space-y-4">
      {total > 1 && (
        <p className="px-1 text-[12.5px] font-medium leading-[18px] text-ink-700">
          {count} {count === 1 ? "item" : "items"}, splitting into{" "}
          <strong className="font-bold text-ink">{total === 2 ? "two shipments" : `${total} shipments`}</strong>. They
          travel separately — no delivery time is set for either yet.
        </p>
      )}

      {shipments.map((group) => (
        <section
          key={group.sequence}
          aria-label={total > 1 ? `Shipment ${group.sequence} of ${total}` : "Shipment"}
          className="rounded-2xl border border-mist/20 bg-white shadow-2xs"
        >
          <header className="border-b border-mist/10 px-4 pb-3 pt-3.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <SpeedChip speed={group.speedClass} />
              {total > 1 && (
                <span className="text-[12.5px] font-bold tracking-[-0.01em] text-ink">
                  Shipment {group.sequence} of {total}
                </span>
              )}
              <span className="text-[11.5px] font-medium text-ink-500">
                {group.itemCount} {group.itemCount === 1 ? "item" : "items"}
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] font-medium leading-4 text-ink-500">
              {group.speedClass === "express"
                ? "Small goods from the Srinagar store."
                : "Heavy material by truck, unloaded at the gate."}
            </p>
          </header>

          <ul className="divide-y divide-mist/10">
            {group.lines.map((line) => (
              <li key={line.itemId} className="flex gap-3 p-4">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-mist/15 bg-mist/5">
                  {line.imageUrl ? (
                    <Image src={line.imageUrl} alt={line.title} fill className="object-contain p-1" sizes="64px" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-ink/20">VE</div>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div>
                    <h4 className="truncate text-xs font-bold leading-tight text-ink">{line.title}</h4>
                    <p className="mt-0.5 text-[10px] font-semibold leading-none text-ink/40">
                      Unit price: {formatPaise(line.unitPricePaise)}
                    </p>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold leading-none text-ink">
                      {formatPaise(line.lineTotalPaise)}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onRemove(line.itemId)}
                        className="flex size-7 items-center justify-center rounded-lg border border-mist/20 text-danger hover:bg-danger/5"
                        title="Remove item"
                        aria-label={`Remove ${line.title}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>

                      <div className="flex h-7 items-center rounded-lg bg-brand-deep px-1 text-white">
                        <button
                          type="button"
                          onClick={() => onDecrease(line.itemId, line.qty)}
                          disabled={pending}
                          aria-label={`Decrease ${line.title}`}
                          className="flex size-5.5 items-center justify-center rounded-md font-bold hover:bg-white/10 disabled:opacity-50"
                        >
                          -
                        </button>
                        <span className="min-w-4 px-1 text-center text-[10px] font-extrabold">{line.qty}</span>
                        <button
                          type="button"
                          onClick={() => onIncrease(line.itemId, line.qty)}
                          disabled={pending}
                          aria-label={`Increase ${line.title}`}
                          className="flex size-5.5 items-center justify-center rounded-md font-bold hover:bg-white/10 disabled:opacity-50"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
