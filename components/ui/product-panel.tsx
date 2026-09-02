import React from "react";
import { cn } from "@/lib/utils";

/**
 * The tinted product panel the design uses everywhere a product appears —
 * listing rows, the visual grid, the product page gallery, cart lines, the
 * home rails.
 *
 * Two rules from the design system, both enforced here rather than at each
 * call site:
 *
 *  1. A panel takes the tint of its L1 *group*. A category never picks its own
 *     colour, so a new category inherits correctly by being added to GROUP_TINT.
 *  2. The artwork is a line drawing of the material itself, never a filled icon
 *     and never a photograph. One neutral stroke works on all four tints.
 *
 * This replaces the grey gradient placeholder, which read as a missing image
 * rather than as a deliberate stand-in.
 */

export type GlyphName =
  | "bag"
  | "tile"
  | "paint"
  | "drop"
  | "ply"
  | "tube"
  | "hinge"
  | "kitchen"
  | "wardrobe"
  | "lock"
  | "tools"
  | "wire"
  | "switch"
  | "conduit"
  | "bulb"
  | "fan"
  | "appliance"
  | "drill"
  | "pipe"
  | "tap"
  | "sink"
  | "clip";

const PATHS: Record<GlyphName, React.ReactNode> = {
  bag: (
    <>
      <path d="M6 3h12l2 6v12H4V9z" />
      <path d="M10 3v6h4V3" />
    </>
  ),
  tile: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </>
  ),
  paint: (
    <>
      <path d="M19 11V4a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v7" />
      <path d="M5 11h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
    </>
  ),
  drop: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
  ply: (
    <>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 12l9 4 9-4" />
      <path d="M3 17l9 4 9-4" />
    </>
  ),
  tube: (
    <>
      <path d="M10 2v4h4V2" />
      <path d="M6 6h12v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
    </>
  ),
  hinge: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="16" r="1.5" />
    </>
  ),
  kitchen: (
    <>
      <path d="M3 6h18v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 10h18" />
    </>
  ),
  wardrobe: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M12 3v18" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  tools: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  ),
  wire: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  switch: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  conduit: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="16" cy="12" r="2" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 5.5v1.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V14.5c1.5-1 3-3 3-5.5a7 7 0 0 0-7-7z" />
    </>
  ),
  fan: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9c0-3.5 2-5 5-5s2 3.5 0 5-5 0-5 0z" />
      <path d="M9 12c-3.5 0-5-2-5-5s3.5-2 5 0 0 5 0 5z" />
      <path d="M12 15c0 3.5-2 5-5 5s-2-3.5 0-5 5 0 5 0z" />
      <path d="M15 12c3.5 0 5 2 5 5s-3.5 2-5 0 0-5 0-5z" />
    </>
  ),
  appliance: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 12h6" />
      <path d="M12 9v6" />
    </>
  ),
  drill: (
    <>
      <path d="M14 6l3 3-7 7H7v-3l7-7z" />
      <path d="M18 10l-4-4" />
    </>
  ),
  pipe: (
    <>
      <path d="M4 6h16v12H4z" />
      <path d="M8 6v12" />
      <path d="M16 6v12" />
    </>
  ),
  tap: (
    <>
      <path d="M4 12h16a1 1 0 0 1 1 1v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-2a1 1 0 0 1 1-1z" />
      <path d="M6 12V5a2 2 0 0 1 2-2h1" />
    </>
  ),
  sink: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="12" r="3" />
    </>
  ),
  clip: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v3H9z" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </>
  ),
};

/** Every category, its L1 group tint and the material it draws. */
const CATEGORY: Record<string, { tint: string; glyph: GlyphName }> = {
  // Civil & Interiors — clay
  cement: { tint: "var(--color-tint-civil)", glyph: "bag" },
  tiling: { tint: "var(--color-tint-civil)", glyph: "tile" },
  painting: { tint: "var(--color-tint-civil)", glyph: "paint" },
  waterproofing: { tint: "var(--color-tint-civil)", glyph: "drop" },
  "plywood-mdf-hdhmr": { tint: "var(--color-tint-civil)", glyph: "ply" },
  fevicol: { tint: "var(--color-tint-civil)", glyph: "tube" },

  // Furniture & Architectural Hardware — pale amber
  "hinges-channels-handles": { tint: "var(--color-tint-furniture)", glyph: "hinge" },
  "kitchen-systems-accessories": { tint: "var(--color-tint-furniture)", glyph: "kitchen" },
  "wardrobe-bed-fittings": { tint: "var(--color-tint-furniture)", glyph: "wardrobe" },
  "door-locks-hardware": { tint: "var(--color-tint-furniture)", glyph: "lock" },
  "general-hardware-tools": { tint: "var(--color-tint-furniture)", glyph: "tools" },

  // Electrical — pale blue
  "wires-mcb-distribution-boards": { tint: "var(--color-tint-electrical)", glyph: "wire" },
  "switches-sockets": { tint: "var(--color-tint-electrical)", glyph: "switch" },
  "conduits-gi-boxes": { tint: "var(--color-tint-electrical)", glyph: "conduit" },
  lighting: { tint: "var(--color-tint-electrical)", glyph: "bulb" },
  "ceiling-fans-exhaust": { tint: "var(--color-tint-electrical)", glyph: "fan" },
  "home-appliances-power-backup": { tint: "var(--color-tint-electrical)", glyph: "appliance" },

  // Plumbing, Sanitary & Bath — pale stone
  "cpvc-pipes-overhead-tanks": { tint: "var(--color-tint-plumbing)", glyph: "pipe" },
  "sanitary-bath-fittings": { tint: "var(--color-tint-plumbing)", glyph: "tap" },
  "kitchen-sinks-faucets": { tint: "var(--color-tint-plumbing)", glyph: "sink" },
};

/**
 * The four L1 groups in display order, each with its tint and its categories.
 *
 * Same taxonomy as CATEGORY above, expressed the way the browse screens need it:
 * grouped, ordered, with display names. Adding a category means adding it in
 * both places — CATEGORY for its panel, here for where it sits in the tree.
 */
export const CATEGORY_GROUPS: {
  title: string;
  tint: string;
  categories: { name: string; slug: string }[];
}[] = [
  {
    title: "Civil & Interiors",
    tint: "var(--color-tint-civil)",
    categories: [
      { name: "Cement", slug: "cement" },
      { name: "Tiling", slug: "tiling" },
      { name: "Painting", slug: "painting" },
      { name: "Waterproofing", slug: "waterproofing" },
      { name: "Plywood, MDF & HDHMR", slug: "plywood-mdf-hdhmr" },
      { name: "Adhesives & Sealants", slug: "fevicol" },
    ],
  },
  {
    title: "Furniture & Architectural Hardware",
    tint: "var(--color-tint-furniture)",
    categories: [
      { name: "Hinges, Channels & Handles", slug: "hinges-channels-handles" },
      { name: "Kitchen Systems", slug: "kitchen-systems-accessories" },
      { name: "Wardrobe & Bed Fittings", slug: "wardrobe-bed-fittings" },
      { name: "Door Locks & Hardware", slug: "door-locks-hardware" },
      { name: "General Hardware & Tools", slug: "general-hardware-tools" },
    ],
  },
  {
    title: "Electrical",
    tint: "var(--color-tint-electrical)",
    categories: [
      { name: "Wires, MCB & Distribution", slug: "wires-mcb-distribution-boards" },
      { name: "Switches & Sockets", slug: "switches-sockets" },
      { name: "Conduits & GI Boxes", slug: "conduits-gi-boxes" },
      { name: "Lighting", slug: "lighting" },
      { name: "Ceiling Fans & Exhaust", slug: "ceiling-fans-exhaust" },
      /* Was "appliances-power-backup", which 404s — the category exists but
         its slug is home-appliances-power-backup. A category listed in the
         main navigation that dead-ends is worse than one that is missing:
         somebody clicks it looking for an inverter and concludes the shop is
         broken.

         "Power Tools & Accessories" sat here too and has no category behind it
         at all, in any environment. Removed rather than invented — a category
         is a shelf, and there is nothing on this one. */
      { name: "Home Appliances & Power Backup", slug: "home-appliances-power-backup" },
    ],
  },
  {
    title: "Plumbing, Sanitary & Bath",
    tint: "var(--color-tint-plumbing)",
    categories: [
      { name: "CPVC Pipes & Overhead Tanks", slug: "cpvc-pipes-overhead-tanks" },
      { name: "Sanitary & Bath Fittings", slug: "sanitary-bath-fittings" },
      { name: "Kitchen Sinks & Faucets", slug: "kitchen-sinks-faucets" },
    ],
  },
];

/** Every category across the four groups. */
export const TOTAL_CATEGORIES = CATEGORY_GROUPS.reduce((n, g) => n + g.categories.length, 0);

/** An unmapped category falls back to the furniture tint and a generic tool. */
const FALLBACK = { tint: "var(--color-tint-furniture)", glyph: "tools" as GlyphName };

/**
 * The single generic asset every product currently points at, installed by the
 * ISS-044 brand-imagery remediation. It is one grey square shared across the
 * whole catalogue, so it carries no information — a bag of cement and a light
 * fitting render identically.
 *
 * Treat it as "no photograph" so the tinted panel renders instead, which is
 * what the design specifies and which at least tells the two apart. Real
 * photography will have its own URLs and takes over automatically.
 */
export function isGenericPlaceholder(url: string | null | undefined): boolean {
  return !url || url === "/placeholder-product.webp";
}

export function glyphFor(categorySlug: string): GlyphName {
  return (CATEGORY[categorySlug] ?? FALLBACK).glyph;
}

export function categoryTint(categorySlug: string): string {
  return (CATEGORY[categorySlug] ?? FALLBACK).tint;
}

export function CategoryGlyph({
  name,
  className = "size-8",
}: {
  name: GlyphName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="rgba(17,17,17,.5)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}

interface ProductPanelProps {
  /** Drives both the tint and the drawing. */
  categorySlug: string;
  /** Described to assistive tech; the drawing itself is decorative. */
  label: string;
  className?: string;
  glyphClassName?: string;
}

export function ProductPanel({
  categorySlug,
  label,
  className,
  glyphClassName = "size-2/5",
}: ProductPanelProps) {
  const { tint, glyph } = CATEGORY[categorySlug] ?? FALLBACK;

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("flex items-center justify-center overflow-hidden", className)}
      style={{ backgroundColor: tint }}
    >
      <CategoryGlyph name={glyph} className={glyphClassName} />
    </div>
  );
}
