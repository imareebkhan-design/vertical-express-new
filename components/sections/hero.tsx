"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, MapPin, Truck, Zap } from "lucide-react";

export function Hero() {
  const [pincode, setPincode] = useState("190014");
  const [area] = useState("Hyderpora");
  const [editingPincode, setEditingPincode] = useState(false);

  return (
    <section className="pt-[52px]">
      {/* Hero Main Block */}
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-14 px-6 lg:flex-row">
        {/* Left: Copy & Value Proposition */}
        <div className="flex-1 min-w-0">
          {/* Was "21 categories · 4,100 products". The catalogue holds 45.
              A count on the first line a customer reads is a claim about how
              much of their list we can fill, and being 91x out is the kind of
              thing they discover at the second search. Categories are real and
              countable; the product figure is gone rather than replaced with a
              number that will drift again. */}
          <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-500">
            Srinagar · Construction material, delivered
          </div>

          <h1 className="mt-3.5 text-4xl font-extrabold tracking-[-0.035em] text-ink sm:text-5xl lg:text-[54px] lg:leading-[58px]">
            <span className="font-light text-ink/70">Building material,</span>
            <br />
            on site today.
          </h1>

          {/* The brand list is gone. It named UltraTech, ACC, Asian Paints,
              Century Ply, Havells, Finolex, Jaquar and Hindware, and the
              catalogue carries ZERO products under any of them — every one of
              the 45 sits under an invented brand (ISS-007). Naming eight real
              manufacturers as your suppliers when you stock none of them is a
              statement about other people's businesses, not just your own.

              It goes back when products are actually assigned to those brands,
              which is the owner's call and nobody else's. */}
          <p className="mt-4 max-w-[470px] text-[15px] font-medium leading-[23px] text-ink-700">
            Cement, tiles, wiring, plywood and fittings — delivered across the valley.
          </p>

          <div className="mt-[26px] flex flex-wrap items-center gap-3">
            <Link
              href="/categories"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[14px] font-bold text-white shadow-card hover:bg-ink/90 transition-all active:scale-95"
            >
              <span>Browse materials</span>
              <ChevronRight className="size-4" />
            </Link>

            <Link
              href="/how-we-work"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-chip px-6 text-[14px] font-bold text-ink hover:bg-chip-hover transition-all active:scale-95"
            >
              How delivery works
            </Link>
          </div>

          {/* Two delivery promises used to sit here and neither was backed.

              "60 min" is the express window CLAUDE.md lists as unverified and
              which the settings table deliberately leaves empty — the speed
              chip on every product card already had it removed for exactly this
              reason (ISS-054). "Tomorrow, 8 AM · On a slot you pick at
              checkout" described slot selection, which does not exist in any
              form: no model, no screen, and nothing in checkout that offers a
              window (ISS-057).

              What is left is true. Small goods go out from the Srinagar store
              ahead of the truck; heavy material travels by truck. That is the
              real distinction and it is what the whole speed-class system
              already encodes. The times come back when the owner sets them. */}
          <div className="mt-[30px] flex flex-col gap-7 sm:flex-row sm:gap-7">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-chip bg-brand px-2 py-0.5 text-[11px] font-extrabold text-ink">
                <Zap className="size-3 fill-ink stroke-none" />
                Fast
              </span>
              <div>
                <div className="text-[13.5px] font-bold text-ink">Hardware, electricals, paint</div>
                <div className="text-[11px] font-semibold text-ink-500">
                  Held in our Srinagar store
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex items-center rounded-chip bg-amber-soft px-2 py-0.5 text-[11px] font-extrabold text-ink">
                By truck
              </span>
              <div>
                <div className="text-[13.5px] font-bold text-ink">Cement, tiles, tanks</div>
                <div className="text-[11px] font-semibold text-ink-500">
                  Heavy material, delivered to site
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Graphic Composition */}
        <div className="relative h-[340px] w-full max-w-[480px] shrink-0 sm:h-[400px] lg:w-[520px]">
          {/* Card 1: Civil (Cement / Bag) */}
          <div
            className="absolute left-4 top-14 flex h-[232px] w-[200px] -rotate-7 items-center justify-center rounded-[36px] bg-civil-soft shadow-card transition-transform hover:scale-105"
            style={{ backgroundColor: "var(--t-civil)" }}
          >
            <div className="flex flex-col items-center gap-2 text-ink-700">
              <svg className="size-24 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
                <path d="M6 3h12l2 6v12H4V9z" />
                <path d="M10 3v6h4V3" />
              </svg>
            </div>
          </div>

          {/* Card 2: Paint (Furn / Paint bucket) */}
          <div
            className="absolute left-[160px] top-4 flex h-[260px] w-[220px] rotate-4 items-center justify-center rounded-[40px] bg-furn-soft shadow-card-hover transition-transform hover:scale-105"
            style={{ backgroundColor: "var(--t-furn)" }}
          >
            <div className="flex flex-col items-center gap-2 text-ink-700">
              <svg className="size-26 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
                <path d="M19 11V4a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v7" />
                <path d="M5 11h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
              </svg>
            </div>
          </div>

          {/* Card 3: Elec (Wire coil) */}
          <div
            className="absolute left-[310px] top-24 flex h-[206px] w-[176px] rotate-10 items-center justify-center rounded-[32px] bg-elec-soft shadow-card transition-transform hover:scale-105"
            style={{ backgroundColor: "var(--t-elec)" }}
          >
            <div className="flex flex-col items-center gap-2 text-ink-700">
              <svg className="size-20 stroke-[1.4] fill-none stroke-current" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </div>
          </div>

          {/* Bolt Badge */}
          <div className="absolute left-[110px] top-[260px] flex size-[74px] items-center justify-center rounded-full bg-paper shadow-card-hover">
            <Zap className="size-8 fill-brand stroke-none" />
          </div>

          {/* Delivering in Srinagar Pill */}
          <div className="absolute left-[260px] top-[290px] flex h-10 items-center gap-2 rounded-full bg-paper px-4.5 shadow-card">
            <Truck className="size-4 text-ink-500" />
            <span className="text-[13px] font-bold text-ink">Delivering in Srinagar</span>
          </div>
        </div>
      </div>

      {/* Pincode & Info Bar */}
      <div className="mx-auto max-w-[1200px] px-6 pt-9">
        <div className="flex flex-wrap items-center gap-5 rounded-[22px] bg-paper px-6 py-4 shadow-card border border-line">
          <div className="flex items-center gap-2">
            <MapPin className="size-4.5 text-ink-500" aria-hidden />
            <span className="text-[13.5px] font-bold text-ink">
              Delivering to {pincode} · {area}
            </span>
          </div>

          {editingPincode ? (
            <input
              autoFocus
              value={pincode}
              maxLength={6}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
              onBlur={() => setEditingPincode(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingPincode(false)}
              className="w-16 border-b border-ink bg-transparent text-[11px] font-bold focus:outline-none"
              aria-label="Change delivery pincode"
            />
          ) : (
            <button
              onClick={() => setEditingPincode(true)}
              className="text-[11px] font-bold text-ink underline underline-offset-2 hover:text-ink-700 cursor-pointer"
            >
              Change pincode
            </button>
          )}

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

