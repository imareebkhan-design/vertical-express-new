import * as React from "react";
import type { OrderStatus, PaymentStatus, ProductStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

/**
 * Status chip for the operations console. Admin only — the storefront palette
 * has no green or red.
 *
 * Every chip carries a word as well as a colour. Colour is there to speed up
 * scanning sixty rows; the label is what actually communicates, and it is what
 * a colour-blind operator reads.
 */
export type StatusTone = "neutral" | "info" | "warn" | "bad" | "ok";

const tones: Record<StatusTone, string> = {
  neutral: "bg-chip text-ink-500",
  info: "bg-ops-info-tint text-ops-info",
  warn: "bg-ops-warn-tint text-ops-warn",
  bad: "bg-ops-bad-tint text-ops-bad",
  ok: "bg-ops-ok-tint text-ops-ok",
};

export function StatusChip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-chip px-2.5 text-[10.5px] font-bold whitespace-nowrap",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Order status → tone + label. Mirrors the OrderStatus enum exactly. */
const ORDER_STATUS: Record<OrderStatus, { tone: StatusTone; label: string }> = {
  pending_payment: { tone: "warn", label: "Awaiting payment" },
  confirmed: { tone: "info", label: "Confirmed" },
  packed: { tone: "info", label: "Packed" },
  out_for_delivery: { tone: "info", label: "Out for delivery" },
  delivered: { tone: "ok", label: "Delivered" },
  cancelled: { tone: "neutral", label: "Cancelled" },
  refund_initiated: { tone: "warn", label: "Refund initiated" },
  refunded: { tone: "neutral", label: "Refunded" },
};

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const { tone, label } = ORDER_STATUS[status];
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

const PAYMENT_STATUS: Record<PaymentStatus, { tone: StatusTone; label: string }> = {
  created: { tone: "warn", label: "Created" },
  authorized: { tone: "info", label: "Authorized" },
  captured: { tone: "ok", label: "Captured" },
  failed: { tone: "bad", label: "Failed" },
  refunded: { tone: "neutral", label: "Refunded" },
};

export function PaymentStatusChip({ status }: { status: PaymentStatus }) {
  const { tone, label } = PAYMENT_STATUS[status];
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

const PRODUCT_STATUS: Record<ProductStatus, { tone: StatusTone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  published: { tone: "ok", label: "Published" },
  archived: { tone: "neutral", label: "Archived" },
};

export function ProductStatusChip({ status }: { status: ProductStatus }) {
  const { tone, label } = PRODUCT_STATUS[status];
  return <StatusChip tone={tone}>{label}</StatusChip>;
}
