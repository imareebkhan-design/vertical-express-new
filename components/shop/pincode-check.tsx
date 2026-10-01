"use client";

import { useState } from "react";
import { Loader2, MapPin, PackageCheck, PackageX } from "lucide-react";
import { formatPaise } from "@/lib/money";
import { etaPhrase } from "@/lib/order-display";
import type { SpeedClass } from "@/lib/speed";
import type { ServiceabilityResult } from "@/lib/services/serviceability";
import { useDeliveryPincode } from "@/hooks/use-delivery-pincode";

/**
 * Delivery pincode checker on the PDP.
 *
 * Starts from the pincode the customer chose in the navbar, or empty — never a
 * hardcoded one. It was prefilled with 190001, which presented a location the
 * customer never gave. `speed` is this product's delivery class: the pincode's
 * minute quote describes the quick run, so a truck product states no time.
 */
export function PincodeCheck({ speed }: { speed: SpeedClass }) {
  const { pincode: chosen } = useDeliveryPincode();
  /* Null until the customer types; until then the field shows their chosen
     pincode (which arrives after hydration, so it cannot be useState's seed). */
  const [typed, setTyped] = useState<string | null>(null);
  const pincode = typed ?? chosen ?? "";
  const setPincode = (v: string) => setTyped(v);
  const [result, setResult] = useState<ServiceabilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    if (!/^[1-9][0-9]{5}$/.test(pincode)) {
      setError("Enter a valid 6-digit pincode");
      setResult(null);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/serviceability/${pincode}`);
      const data = (await res.json()) as ServiceabilityResult;
      setResult(data);
    } catch {
      setError("Could not check right now. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-card border border-hairline-border p-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest text-neutral-500">
        <MapPin className="size-3.5 text-brand-deep" aria-hidden /> Check delivery
      </p>
      <div className="flex gap-2">
        <input
          inputMode="numeric"
          maxLength={6}
          placeholder="Enter pincode"
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && check()}
          className="h-10 flex-1 rounded-[8px] border border-neutral-200 px-3 text-sm font-bold focus:border-brand-deep focus:outline-none bg-surface-soft/40"
          aria-label="Delivery pincode"
        />
        <button
          onClick={check}
          disabled={loading}
          className="h-10 cursor-pointer rounded-[8px] bg-brand-deep px-4 text-xs font-extrabold uppercase tracking-wider text-white transition-all duration-200 hover:bg-neutral-800 active:scale-[0.97] disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Check"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs font-bold text-danger">{error}</p>}

      {result && !error && (
        <div className="mt-3 flex items-start gap-2 text-sm font-bold">
          {result.serviceable ? (
            <>
              <PackageCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              {/*
                The time is only shown when there is one.

                `etaMinutes` is 0 when an operator has deliberately set "no
                promise" for a pincode — a state the serviceability editor
                offers precisely because no delivery window is confirmed. This
                rendered it unguarded as "Delivering in ~0 min", which reads as
                instant delivery rather than as no commitment. The checkout
                view already guards the same value with a truthiness check; this
                one did not.

                Absent means absent, the same way the speed chip treats a
                missing window (lib/speed.ts) — it says "Fast", not "0 min".
              */}
              <span className="text-neutral-700">
                {speed === "express" && result.etaMinutes && result.etaMinutes > 0
                  ? `${etaPhrase(result.etaMinutes)} from dispatch · `
                  : speed === "express"
                    ? "We deliver here · "
                    : "We deliver here, by truck · "}
                {result.deliveryFeePaise === 0
                  ? "Free delivery"
                  : `${formatPaise(result.deliveryFeePaise ?? 0)} delivery`}
                {/* Was " · Pay on delivery available" whenever the pincode allows
                    cash. Cash on delivery is also switched off business-wide
                    (Settings), which checkout enforces and this raw pincode flag
                    does not know — so this promised a payment method checkout
                    then refuses. Availability is stated at checkout, not here. */}
              </span>
            </>
          ) : (
            <>
              <PackageX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <span className="text-neutral-700">
                We don&apos;t deliver to this pincode yet.
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
