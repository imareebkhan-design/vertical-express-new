"use client";

import { useState } from "react";
import { Loader2, MapPin, PackageCheck, PackageX } from "lucide-react";
import { formatPaise } from "@/lib/money";
import type { ServiceabilityResult } from "@/lib/services/serviceability";

/** Delivery pincode checker used on the PDP (and reused at checkout). */
export function PincodeCheck({ defaultPincode = "" }: { defaultPincode?: string }) {
  const [pincode, setPincode] = useState(defaultPincode);
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
    <div className="rounded-card border border-neutral-200 p-4">
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
          className="h-10 flex-1 rounded-lg border border-neutral-200 px-3 text-sm font-bold focus:border-ink focus:outline-none"
          aria-label="Delivery pincode"
        />
        <button
          onClick={check}
          disabled={loading}
          className="h-10 cursor-pointer rounded-lg bg-ink px-4 text-xs font-extrabold uppercase tracking-widest text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
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
              <span className="text-neutral-700">
                Delivering in ~{result.etaMinutes} min ·{" "}
                {result.deliveryFeePaise === 0
                  ? "Free delivery"
                  : `${formatPaise(result.deliveryFeePaise ?? 0)} delivery`}
                {result.codAllowed && " · Pay on delivery available"}
              </span>
            </>
          ) : (
            <>
              <PackageX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <span className="text-neutral-700">
                Not serviceable yet at this pincode. We&apos;re expanding soon.
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
