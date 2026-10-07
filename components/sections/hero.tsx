"use client";

import { useState } from "react";
import { MapPin, Zap } from "lucide-react";
import { useDeliveryPincode } from "@/hooks/use-delivery-pincode";
import { HeroBanners } from "@/components/merchandising/hero-banners";

export function Hero() {
  const { pincode, city: area, hasChosen, checking, error, confirm } = useDeliveryPincode();
  const [pincodeInput, setPincodeInput] = useState("");
  const [editingPincode, setEditingPincode] = useState(false);

  return (
    <section className="pt-6">
      {/* The banners carry the campaign copy (lib/merchandising/home.ts). The
          page's one h1 stays here, out of the carousel, so it does not rotate
          away or repeat per slide. */}
      <h1 className="sr-only">Building material, on site today — Vertical Express, Srinagar</h1>
      <div className="mx-auto max-w-[1200px] px-6">
        <HeroBanners />
      </div>

      {/* Pincode & Info Bar */}
      <div className="mx-auto max-w-[1200px] px-6 pt-5">
        <div className="flex flex-wrap items-center gap-5 rounded-[22px] bg-paper px-6 py-4 shadow-card border border-line">
          <div className="flex items-center gap-2">
            <MapPin className="size-4.5 text-ink-500" aria-hidden />
            <span className="text-[13.5px] font-bold text-ink">
              {hasChosen ? `Delivering to ${pincode} · ${area}` : "Enter your pincode to check delivery"}
            </span>
          </div>

          {editingPincode ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={pincodeInput}
                maxLength={6}
                disabled={checking}
                onChange={(e) => setPincodeInput(e.target.value.replace(/\D/g, ""))}
                onBlur={() => {
                  if (pincodeInput) void confirm(pincodeInput).then((ok) => { if (ok) setEditingPincode(false); });
                  else setEditingPincode(false);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || !pincodeInput) return;
                  void confirm(pincodeInput).then((ok) => { if (ok) setEditingPincode(false); });
                }}
                className="w-16 border-b border-ink bg-transparent text-[11px] font-bold focus:outline-none"
                aria-label="Change delivery pincode"
              />
              {error ? <span className="text-[11px] font-semibold text-danger">{error}</span> : null}
            </div>
          ) : (
            <button
              onClick={() => { setPincodeInput(pincode ?? ""); setEditingPincode(true); }}
              className="text-[11px] font-bold text-ink underline underline-offset-2 hover:text-ink-700 cursor-pointer"
            >
              {hasChosen ? "Change pincode" : "Enter pincode"}
            </button>
          )}

          {/* What is true about speed, moved here from the old hero copy: small
              goods go out from the Srinagar store, heavy material by truck. No
              times — "60 min" and delivery slots were removed as unbacked
              (ISS-054, ISS-057) and come back when the owner sets them. */}
          <div className="ml-auto hidden items-center gap-6 lg:flex">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-chip bg-brand px-2 py-0.5 text-[11px] font-extrabold text-ink">
                <Zap className="size-3 fill-ink stroke-none" aria-hidden />
                Fast
              </span>
              <span className="text-[12.5px] font-semibold text-ink-700">Hardware, electricals, paint</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-chip bg-amber-soft px-2 py-0.5 text-[11px] font-extrabold text-ink">
                By truck
              </span>
              <span className="text-[12.5px] font-semibold text-ink-700">Cement, tiles, tanks</span>
            </div>
          </div>

          {/* Two more claims removed from this strip.

              "Cash or UPI at the gate · up to ₹50,000 per shipment" offered
              cash on delivery with a ceiling. COD is switched off shop-wide in
              settings — checkout does not offer it — and ₹50,000 is a limit
              nobody set; CLAIMS like it are exactly what CLAUDE.md means by a
              COD value limit with no policy behind it. Advertising a payment
              method the checkout refuses is a promise broken at the last step.

              "Winter lead times shift — seasonal items show 5–7 days" described
              a seasonal rule. There is none: no window, no affected categories,
              no lead time, and nothing applies one (the Serviceability screen
              says so in as many words). Srinagar winters genuinely do disrupt
              delivery, which is why this needs last winter's real data rather
              than a number that reads well.

              Both come back when the owner sets them. Until then the strip
              carries only what is true: where we deliver. */}
        </div>
      </div>
    </section>
  );
}

