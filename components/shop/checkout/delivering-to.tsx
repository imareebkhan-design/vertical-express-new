import React from "react";
import { MapPin } from "lucide-react";
import { hasMapPin } from "@/components/location/unpinned-address-notice";
import { cn } from "@/lib/utils";

/**
 * What checkout says about the delivery address, the same on desktop and phone.
 *
 * The address the order goes to used to be shown only as a selected card in a
 * list near the top; nothing beside "Pay" restated it, and nothing said which
 * saved addresses carry a map pin. A customer could pay for the wrong site
 * without the screen ever saying which one. A pin is what driver navigation
 * and a route-based arrival time need; an address without one is still
 * delivered to, by its address and pincode, and the customer is told what that
 * costs them.
 */
type Addr = {
  label: string;
  line1: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
};

/** On each saved-address card. */
export function PinBadge({ address, className }: { address: Pick<Addr, "latitude" | "longitude">; className?: string }) {
  const pinned = hasMapPin(address);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold leading-none",
        pinned ? "bg-success/10 text-success" : "bg-mist/20 text-ink/60",
        className
      )}
    >
      <MapPin className="size-3" aria-hidden />
      {pinned ? "Map pin confirmed" : "No map pin"}
    </span>
  );
}

/** Beside the pay button: the one address this order will go to. */
export function DeliveringTo({ address, className }: { address: Addr | null | undefined; className?: string }) {
  if (!address) {
    return (
      <p role="status" className={cn("text-xs font-bold text-danger", className)}>
        Choose a delivery address before paying.
      </p>
    );
  }
  const pinned = hasMapPin(address);
  return (
    <div role="status" aria-label="Delivery address for this order" className={cn("text-xs font-semibold text-ink-700", className)}>
      <p>
        <span className="font-extrabold text-ink">Delivering to </span>
        <span className="capitalize">{address.label}</span> · {address.line1} — {address.pincode}
      </p>
      <p className={cn("mt-0.5 font-bold", pinned ? "text-success" : "text-ink/60")}>
        {pinned
          ? "Map pin confirmed."
          : "No map pin: the driver finds this site by its address and pincode, and an arrival time from the route isn't available."}
      </p>
    </div>
  );
}

/** `?address=` named an address that is no longer the customer's. */
export function RequestedAddressMissing({ className }: { className?: string }) {
  return (
    <p role="alert" className={cn("rounded-panel bg-ops-warn-tint p-3 text-[12.5px] font-semibold text-ops-warn", className)}>
      The address you chose earlier is no longer saved. Check which address is selected below before you pay.
    </p>
  );
}
