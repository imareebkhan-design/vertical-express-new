"use client";

import Link from "next/link";
import { Bath, BedDouble, CookingPot, Sofa, type LucideIcon } from "lucide-react";
import { triggerHaptic } from "@/lib/native/haptics";
import type { listRooms } from "@/lib/services/catalog";

/**
 * "Shop by room" — the homeowner's way into the same catalogue a contractor
 * reaches through the trade taxonomy.
 *
 * The distinction is the whole point of the screen. A contractor knows they
 * need OPC 53 and goes to Cement. Somebody redoing a bathroom does not know
 * what they need and cannot navigate a taxonomy organised around trades, so
 * this is a second index over the existing catalogue, not a second catalogue.
 *
 * WHY THIS RENDERS NOTHING TODAY, RATHER THAN FOUR TILES
 *
 * It used to render four hardcoded tiles — Bathroom, Kitchen, Living room,
 * Bedroom — unconditionally, each linking to `/search?q=<name>`. Checked
 * against the real search endpoint: three of the four return `total: 0` every
 * time, against the seeded demo catalogue, which is materials and hardware,
 * not room-branded products. A tile that promises to help someone shop for a
 * bathroom and returns nothing, 100% of the time, is the exact "control that
 * goes nowhere" failure this codebase's own principles warn against — it just
 * does not crash on the way there.
 *
 * The `rooms`/`room_categories` tables exist for real curation and are empty.
 * Filling them is an editorial decision — which categories a bathroom leads
 * with, in what order — and inventing that mapping would be inventing
 * merchandising, which is not this component's call. So it now takes the same
 * real data the native app already reads through `listRooms()`, and does
 * exactly what the native app does with an empty result: render nothing.
 * `app/page.tsx` fetches it server-side; nothing here fabricates a room.
 */

type Rooms = Awaited<ReturnType<typeof listRooms>>;

/** Best-effort icon per curated room slug. An uncurated slug still renders — with a neutral icon, never with an invented one. */
const ICON_BY_SLUG: Record<string, LucideIcon> = {
  bathroom: Bath,
  kitchen: CookingPot,
  "living-room": Sofa,
  bedroom: BedDouble,
};

/** Tint follows the room's first associated category's group, matching how every other tile in the app colours itself — never a room-specific palette invented here. */
const TINT_BY_GROUP: Record<string, string> = {
  plumbing_bath: "bg-tint-plumbing",
  furniture_hardware: "bg-tint-furniture",
  civil_interiors: "bg-tint-civil",
  electrical: "bg-tint-electrical",
};

export function ShopByRoom({ rooms }: { rooms: Rooms }) {
  if (rooms.length === 0) return null;

  return (
    <section aria-labelledby="shop-by-room" className="px-4 pt-[18px]">
      <h2 id="shop-by-room" className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">
        Shop by room
      </h2>

      <div className="mt-[11px] grid grid-cols-2 gap-[9px]">
        {rooms.map((room) => {
          const firstCategory = room.categories[0];
          const Icon = ICON_BY_SLUG[room.slug] ?? Sofa;
          const tint = firstCategory ? (TINT_BY_GROUP[firstCategory.group] ?? "bg-tint-furniture") : "bg-tint-furniture";
          /* A curated room with no categories yet attached is not shoppable —
             every category it will lead with is still unset — so it links to
             the general catalogue rather than to nothing. Once at least one
             category is attached, the room goes straight to it: there is no
             dedicated room-landing page to send it to instead, and a real,
             narrower category is a better result than the full catalogue. */
          const href = firstCategory ? `/category/${firstCategory.slug}` : "/categories";
          return (
            <Link
              key={room.slug}
              href={href}
              onClick={() => triggerHaptic("light")}
              className="flex h-[70px] items-center gap-[11px] rounded-[20px] bg-paper px-3 shadow-card active:opacity-90"
            >
              <span
                className={`flex size-11 flex-none items-center justify-center rounded-[15px] ${tint}`}
                aria-hidden
              >
                <Icon className="size-[26px] text-ink/45" strokeWidth={1.5} />
              </span>
              <span className="text-[14px] font-bold text-ink">{room.name}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
