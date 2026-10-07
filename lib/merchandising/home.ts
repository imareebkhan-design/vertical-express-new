/**
 * Homepage merchandising — the one place its copy, imagery and campaign data live.
 *
 * Every banner line, category picture, "Trending in Srinagar" pick and the Deal
 * of the Day is configured here and nowhere else, so the owner's changes are a
 * data edit, not a component edit. Components read this file; they do not carry
 * their own paths or copy.
 *
 * What this file must never contain is a commercial claim nobody has made. There
 * is no discount, offer value, ranking or deadline below that the owner has not
 * supplied — the fields that would carry one are `null`, and the components show
 * a truthful default until they are filled. See `docs/OWNER_INPUT_REQUIRED.md`.
 *
 * Imagery is editorial: illustrative scenes cropped from the unbranded login
 * artwork (provenance in docs/ASSET_PROVENANCE.md). It shows the kind of
 * material in a category, never a specific product, and carries no text.
 */

export interface MerchImage {
  src: string;
  alt: string;
  /** CSS object-position — which part of the picture survives a crop. */
  focal?: string;
}

export interface MerchLink {
  label: string;
  href: string;
}

export interface HeroBanner {
  id: string;
  /** Short label above the headline. */
  eyebrow: string;
  title: string;
  body: string;
  /**
   * An extra highlighted line for a real offer ("Free delivery on your first
   * order", say). `null` until the owner supplies one — never filled with a
   * plausible-sounding guess.
   */
  offer: string | null;
  primary: MerchLink;
  secondary?: MerchLink;
  /**
   * A photograph, or a collage of category pictures. Either can be swapped by
   * editing this file. A missing or failing file falls back to a tinted panel.
   */
  visual: { kind: "photo"; image: MerchImage } | { kind: "collage"; images: MerchImage[] };
}

/* ---------------------------------------------------------------- images */

const BUILD_SCENE: MerchImage = {
  src: "/login/build-scene.webp",
  alt: "Illustrative building site with cement sacks, bricks and steel, mountains beyond",
  focal: "70% 55%",
};
const FINISH_SCENE: MerchImage = {
  src: "/login/finish-scene.webp",
  alt: "Illustrative interior materials: tiles, wood panels, paint and fittings",
  focal: "60% 50%",
};

/**
 * Category slug → picture: one unbranded product on a transparent background,
 * framed identically (640×480, same padding, same shadow), so every tile in a
 * grid reads as one set. The tile behind it supplies the colour. A slug missing
 * here falls back to the category's line drawing. Provenance:
 * docs/ASSET_PROVENANCE.md.
 */
export const CATEGORY_IMAGERY: Readonly<Record<string, MerchImage>> = {
  cement: { src: "/merchandising/category-tiles/cement.webp", alt: "Sacks of cement" },
  tiling: { src: "/merchandising/category-tiles/tiling.webp", alt: "Ceramic floor and wall tiles" },
  painting: { src: "/merchandising/category-tiles/painting.webp", alt: "Paint tin, roller and brush" },
  waterproofing: { src: "/merchandising/category-tiles/waterproofing.webp", alt: "Bucket of waterproofing coating with a brush" },
  "plywood-mdf-hdhmr": { src: "/merchandising/category-tiles/plywood-mdf-hdhmr.webp", alt: "Stack of plywood and laminated board" },
  fevicol: { src: "/merchandising/category-tiles/fevicol.webp", alt: "Wood glue bottle and adhesive tub" },
  "hinges-channels-handles": { src: "/merchandising/category-tiles/hinges-channels-handles.webp", alt: "Hinges, a drawer channel and a cabinet handle" },
  "kitchen-systems-accessories": { src: "/merchandising/category-tiles/kitchen-systems-accessories.webp", alt: "Pull-out kitchen basket" },
  "wardrobe-bed-fittings": { src: "/merchandising/category-tiles/wardrobe-bed-fittings.webp", alt: "Wardrobe rail, cabinet hinges and bed gas lifts" },
  "door-locks-hardware": { src: "/merchandising/category-tiles/door-locks-hardware.webp", alt: "Lever door handle with mortise lock" },
  "general-hardware-tools": { src: "/merchandising/category-tiles/general-hardware-tools.webp", alt: "Hammer, spanner and screwdrivers" },
  "wires-mcb-distribution-boards": { src: "/merchandising/category-tiles/wires-mcb-distribution-boards.webp", alt: "Coils of electrical wire and MCBs" },
  "switches-sockets": { src: "/merchandising/category-tiles/switches-sockets.webp", alt: "Modular switch plate with a socket" },
  "conduits-gi-boxes": { src: "/merchandising/category-tiles/conduits-gi-boxes.webp", alt: "PVC conduit fittings and a junction box" },
  lighting: { src: "/merchandising/category-tiles/lighting.webp", alt: "LED bulb, panel light and tube light" },
  "ceiling-fans-exhaust": { src: "/merchandising/category-tiles/ceiling-fans-exhaust.webp", alt: "Ceiling fan" },
  "home-appliances-power-backup": { src: "/merchandising/category-tiles/home-appliances-power-backup.webp", alt: "Home inverter and battery" },
  "cpvc-pipes-overhead-tanks": { src: "/merchandising/category-tiles/cpvc-pipes-overhead-tanks.webp", alt: "Water tank and CPVC pipe fittings" },
  "sanitary-bath-fittings": { src: "/merchandising/category-tiles/sanitary-bath-fittings.webp", alt: "Shower head and basin mixer" },
  "kitchen-sinks-faucets": { src: "/merchandising/category-tiles/kitchen-sinks-faucets.webp", alt: "Stainless steel sink and kitchen faucet" },
};

export function categoryImage(slug: string): MerchImage | null {
  return CATEGORY_IMAGERY[slug] ?? null;
}

/* ---------------------------------------------------------------- banners */

/**
 * Banner 1 is the launch banner. Its wording is the owner's to finalise; the
 * lines below are deliberately general and promise no price, percentage or
 * delivery time. Put a confirmed offer in `offer`.
 */
export const LAUNCH_BANNER: HeroBanner = {
  id: "launch",
  eyebrow: "Vertical Express launch offer",
  title: "Vertical Express is now launching in Srinagar",
  body: "Building materials, delivered across the city.",
  offer: null,
  primary: { label: "Browse materials", href: "/categories" },
  secondary: { label: "How delivery works", href: "/how-we-work" },
  visual: { kind: "photo", image: BUILD_SCENE },
};

export const HERO_BANNERS: readonly HeroBanner[] = [
  LAUNCH_BANNER,
  {
    id: "interiors",
    eyebrow: "Tiles · bath · interiors",
    title: "Make every room your own",
    body: "Tiles, paint, plywood and bath fittings.",
    offer: null,
    primary: { label: "Shop tiling", href: "/category/tiling" },
    secondary: { label: "Bath fittings", href: "/category/sanitary-bath-fittings" },
    visual: { kind: "photo", image: FINISH_SCENE },
  },
  {
    id: "store",
    eyebrow: "Everyday essentials",
    title: "Electricals, hardware and paint",
    body: "Wire, switches, fittings and tools.",
    offer: null,
    primary: { label: "Shop electricals", href: "/category/wires-mcb-distribution-boards" },
    secondary: { label: "Hardware & tools", href: "/category/general-hardware-tools" },
    visual: {
      kind: "collage",
      images: [
        CATEGORY_IMAGERY["wires-mcb-distribution-boards"],
        CATEGORY_IMAGERY.painting,
        CATEGORY_IMAGERY["plywood-mdf-hdhmr"],
      ],
    },
  },
];

/* ---------------------------------------------------------------- trending */

export interface TrendingPick {
  id: string;
  title: string;
  image: MerchImage;
  /** Real category slugs with a short label; the first is the card's main link. Inactive ones are dropped at render. */
  categories: { slug: string; label: string }[];
}

/**
 * "Trending in Srinagar" is CURATED. There is no analytics or ranking source
 * behind it yet, so it says so on screen and never claims a position ("#1",
 * "best-selling"). When real data exists, replace `source` and feed `picks`
 * from it — the component renders whatever list it is given.
 */
export const TRENDING = {
  source: "curated" as "curated" | "analytics",
  title: "Trending in Srinagar",
  picks: [
    {
      id: "new-build",
      title: "Starting a new build",
      image: {
        src: "/merchandising/trending/new-build.webp",
        alt: "Illustrative site with cement sacks and bricks",
        focal: "40% 55%",
      },
      categories: [
        { slug: "cement", label: "Cement" },
        { slug: "waterproofing", label: "Waterproofing" },
      ],
    },
    {
      id: "floors-walls",
      title: "Floors & walls",
      image: {
        src: "/merchandising/trending/floors-walls.webp",
        alt: "Terrazzo and wood-effect tiles",
        focal: "50% 50%",
      },
      categories: [
        { slug: "tiling", label: "Tiling" },
        { slug: "painting", label: "Painting" },
      ],
    },
    {
      id: "bath-kitchen",
      title: "Bath & kitchen",
      image: {
        src: "/merchandising/trending/bath-kitchen.webp",
        alt: "Chrome taps and bath fittings",
        focal: "50% 50%",
      },
      categories: [
        { slug: "sanitary-bath-fittings", label: "Sanitary & bath" },
        { slug: "kitchen-sinks-faucets", label: "Sinks & faucets" },
        { slug: "cpvc-pipes-overhead-tanks", label: "CPVC & tanks" },
      ],
    },
    {
      id: "woodwork",
      title: "Woodwork",
      image: {
        src: "/merchandising/trending/woodwork.webp",
        alt: "Wood and laminate panels beside a paint tin",
        focal: "45% 55%",
      },
      categories: [
        { slug: "plywood-mdf-hdhmr", label: "Plywood & MDF" },
        { slug: "hinges-channels-handles", label: "Hinges & handles" },
      ],
    },
  ] satisfies TrendingPick[],
};

/* ---------------------------------------------------------------- deal */

export interface DealOfTheDayConfig {
  /** A published product. Its title, picture and prices are read from the catalogue, never typed here. */
  productSlug: string;
  /** Optional short line above the title. */
  headline?: string;
  /** ISO 8601 with offset. Without it there is no countdown. After it the deal is not shown. */
  expiresAt?: string;
}

/**
 * The live Deal of the Day, or `null` for "Launch deal — coming soon".
 *
 * OWNER INPUT: no deal has been approved, so this is null. Setting it to a
 * product shows that product at its real catalogue price; a struck-through MRP
 * and a percentage appear only if the product has a compare-at price above it.
 */
export const DEAL_OF_THE_DAY: DealOfTheDayConfig | null = null;
