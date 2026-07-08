import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending_payment: { label: "Payment pending", className: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmed", className: "bg-sky-100 text-sky-800" },
  packed: { label: "Packed", className: "bg-indigo-100 text-indigo-800" },
  out_for_delivery: { label: "Out for delivery", className: "bg-violet-100 text-violet-800" },
  delivered: { label: "Delivered", className: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelled", className: "bg-neutral-200 text-neutral-600" },
  refund_initiated: { label: "Refund initiated", className: "bg-orange-100 text-orange-800" },
  refunded: { label: "Refunded", className: "bg-neutral-200 text-neutral-600" },
};

export function OrderStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: "bg-neutral-200 text-neutral-600" };
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide", meta.className)}>
      {meta.label}
    </span>
  );
}
