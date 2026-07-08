"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, XCircle } from "lucide-react";
import { cancelOrder, reorder } from "@/actions/orders";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";

/** Cancel / reorder controls on the order detail page. */
export function OrderActions({ orderNo, cancellable }: { orderNo: string; cancellable: boolean }) {
  const router = useRouter();
  const { refresh } = useCart();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const doCancel = () => {
    setError(null);
    startTransition(async () => {
      const res = await cancelOrder(orderNo, "Cancelled by customer");
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  };

  const doReorder = () => {
    setError(null);
    startTransition(async () => {
      const res = await reorder(orderNo);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      await refresh();
      router.push("/cart");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={doReorder} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <RotateCcw className="size-4" />} Reorder
        </Button>
        {cancellable && !confirming && (
          <Button variant="ghost" onClick={() => setConfirming(true)} disabled={pending} className="text-danger">
            <XCircle className="size-4" /> Cancel order
          </Button>
        )}
      </div>

      {confirming && (
        <div className="rounded-card border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-bold text-ink">Cancel this order? This can&apos;t be undone.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="dark" size="sm" onClick={doCancel} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : "Yes, cancel"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
              Keep order
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm font-bold text-danger">{error}</p>}
    </div>
  );
}
