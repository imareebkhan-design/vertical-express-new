"use client";

import Link from "next/link";
import { Bath, BedDouble, CookingPot, Sofa } from "lucide-react";
import { triggerHaptic } from "@/lib/native/haptics";

/**
 * "Shop by room" — the homeowner's way into the same catalogue a contractor
 * reaches through the trade taxonomy.
 *
 * The distinction is the whole point of the screen. A contractor knows they
 * need OPC 53 and goes to Cement. Somebody redoing a bathroom does not know
 * what they need and cannot navigate a taxonomy organised around trades, so
 * this is a second index over the existing catalogue, not a second catalogue.
 *
 * ON THE ROOM → CATEGORY MAPPING
 *
 * The `rooms` and `room_categories` tables now exist for this, and they are
 * empty. Filling them is an editorial decision — which categories a bathroom
 * leads with, and in what order — and inventing that mapping would be inventing
 * merchandising. So this renders the design against search until somebody
 * curates the real thing, at which point the hrefs move to /room/[slug] and
 * nothing else here changes.
 *
 * The artboard shows an item count per room ("146 items"). That number cannot
 * exist before the mapping does, and a product count is a fact rather than a
 * commitment, so it is omitted rather than marked with the placeholder rule —
 * which is for money, time, limits and terms.
 */
const ROOMS = [
  { slug: "bathroom", name: "Bathroom", tint: "bg-tint-plumbing", Icon: Bath },
  { slug: "kitchen", name: "Kitchen", tint: "bg-tint-furniture", Icon: CookingPot },
  { slug: "living-room", name: "Living room", tint: "bg-tint-civil", Icon: Sofa },
  { slug: "bedroom", name: "Bedroom", tint: "bg-tint-electrical", Icon: BedDouble },
] as const;

export function ShopByRoom() {
  return (
    <section aria-labelledby="shop-by-room" className="px-4 pt-[18px]">
      <h2 id="shop-by-room" className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">
        Shop by room
      </h2>

      <div className="mt-[11px] grid grid-cols-2 gap-[9px]">
        {ROOMS.map(({ slug, name, tint, Icon }) => (
          <Link
            key={slug}
            href={`/search?q=${encodeURIComponent(name.toLowerCase())}`}
            onClick={() => triggerHaptic("light")}
            className="flex h-[70px] items-center gap-[11px] rounded-[20px] bg-paper px-3 shadow-card active:opacity-90"
          >
            <span
              className={`flex size-11 flex-none items-center justify-center rounded-[15px] ${tint}`}
              aria-hidden
            >
              <Icon className="size-[26px] text-ink/45" strokeWidth={1.5} />
            </span>
            <span className="text-[14px] font-bold text-ink">{name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
