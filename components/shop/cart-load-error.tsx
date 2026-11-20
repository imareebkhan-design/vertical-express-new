"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown instead of the cart skeleton when the cart could not be read and no
 * cart is on screen. A skeleton that never ends tells the customer nothing and
 * leaves no way forward; this says what happened and offers Retry.
 */
export function CartLoadError({ onRetry }: { onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <span className="mb-4 grid size-20 place-items-center rounded-full bg-tile">
        <RefreshCw className="size-9 text-sky-900/30" strokeWidth={1.4} aria-hidden />
      </span>
      <h2 className="text-lg font-extrabold">We couldn&apos;t load your cart</h2>
      <p className="mt-1 max-w-sm text-sm font-semibold text-neutral-500">
        Nothing in it has changed. Check your connection and try again.
      </p>
      <Button className="mt-6" onClick={retry} disabled={retrying}>
        {retrying ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}
