"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { cn } from "@/lib/utils";

/**
 * Compact add control for dense listing rows.
 *
 * Quantity is not exposed here — a spec-driven row is already carrying brand,
 * grade, pack, price, MRP and speed, and a stepper would push the row past the
 * height that makes the layout worth using. Quantity belongs on the product page,
 * where the calculator lives.
 */
export function AddToCartButton({
  variantId,
  title,
  disabled = false,
}: {
  variantId: string;
  title: string;
  disabled?: boolean;
}) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  /* It said "Notify me" and notified nobody — nothing records the request.
     The row already says it is out of stock. */
  if (disabled) return null;

  const handle = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await addItem(variantId, 1, title);
    setBusy(false);
    if (ok) {
      setAdded(true);
      setTimeout(() => setAdded(false), 1400);
    }
  };

  return (
    <button
      onClick={handle}
      disabled={busy}
      aria-label={`Add ${title} to cart`}
      className={cn(
        "grid size-10 cursor-pointer place-items-center rounded-full transition-colors disabled:opacity-60",
        added ? "bg-amber text-ink" : "bg-ink text-white hover:bg-ink/90"
      )}
    >
      {added ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
    </button>
  );
}
