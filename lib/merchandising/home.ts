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
 * Category slug → picture. A slug missing here is not an error: the tile falls
 * back to its tinted icon, which is the intended look for a category whose
 * picture has not been made yet. Only add a picture that shows that category.
 */
export const CATEGORY_IMAGERY: Readonly<Record<string, MerchImage>> = {
  cement: {
    src: "/merchandising/categories/cement.webp",
    alt: "Cement sacks stacked on a building site",
    focal: "50% 55%",
  },
  tiling: {
    src: "/merchandising/categories/tiling.webp",
    alt: "Terrazzo and wood-effect tiles leaning against a wall",
    focal: "50% 45%",
  },
  painting: {
    src: "/merchandising/categories/painting.webp",
    alt: "Open paint tin beside tile and wood samples",
    focal: "50% 60%",
  },
  "plywood-mdf-hdhmr": {
    src: "/merchandising/categories/plywood-mdf-hdhmr.webp",
    alt: "Plywood and laminated board panels",
    focal: "45% 50%",
  },
  "wires-mcb-distribution-boards": {
    src: "/merchandising/categories/wires-mcb-distribution-boards.webp",
    alt: "Coils of electrical wire",
    focal: "50% 50%",
  },
  "sanitary-bath-fittings": {
    src: "/merchandising/categories/sanitary-bath-fittings.webp",
    alt: "Chrome bath taps and fittings",
    focal: "50% 50%",
  },
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
  body: "Building materials, delivered smarter. Explore launch offers across selected categories.",
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
    body: "Tiles, paint, plywood and bath fittings for the finishing stage.",
    offer: null,
    primary: { label: "Shop tiling", href: "/category/tiling" },
    secondary: { label: "Bath fittings", href: "/category/sanitary-bath-fittings" },
    visual: { kind: "photo", image: FINISH_SCENE },
  },
  {
    id: "store",
    eyebrow: "Held in our Srinagar store",
    title: "Electricals, hardware and paint",
    body: "Smaller goods go out from the store; heavy material travels by truck.",
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
  body: string;
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
  subtitle: "Picked by our team for the work going on across the city this season.",
  picks: [
    {
      id: "new-build",
      title: "Starting a new build",
      body: "Cement and waterproofing for the structure.",
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
      body: "Tiles for the floor, paint for the walls.",
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
      body: "Taps, fittings, sinks and the pipes behind them.",
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
      body: "Boards and laminates, and the hardware that holds them.",
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
