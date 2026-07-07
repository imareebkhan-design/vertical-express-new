/**
 * Seeds a demo catalog: 20 categories, neutral brands, ~40 products with
 * variants/bulk tiers, one warehouse, Srinagar pincodes, and launch coupon.
 * Idempotent: upserts by slug/sku so it can run repeatedly.
 */
import { PrismaClient, CategoryGroup } from "@prisma/client";

const db = new PrismaClient();

const CATEGORIES: { slug: string; name: string; group: CategoryGroup; bulk?: boolean }[] = [
  { slug: "cement", name: "Cement", group: "civil_interiors", bulk: true },
  { slug: "tiling", name: "Tiling", group: "civil_interiors", bulk: true },
  { slug: "painting", name: "Painting", group: "civil_interiors" },
  { slug: "waterproofing", name: "Waterproofing", group: "civil_interiors" },
  { slug: "plywood-mdf-hdhmr", name: "Plywood, MDF & HDHMR", group: "civil_interiors" },
  { slug: "fevicol", name: "Fevicol", group: "civil_interiors" },
  { slug: "wires-mcb-distribution-boards", name: "Wires, MCB & Distribution Boards", group: "electrical", bulk: true },
  { slug: "kitchen-sinks-faucets", name: "Kitchen Sinks & Faucets", group: "plumbing_bath" },
  { slug: "sanitary-bath-fittings", name: "Sanitary & Bath Fittings", group: "plumbing_bath" },
  { slug: "switches-sockets", name: "Switches & Sockets", group: "electrical" },
  { slug: "hinges-channels-handles", name: "Hinges, Channels & Handles", group: "furniture_hardware" },
  { slug: "kitchen-systems-accessories", name: "Kitchen Systems & Accessories", group: "furniture_hardware" },
  { slug: "wardrobe-bed-fittings", name: "Wardrobe & Bed Fittings", group: "furniture_hardware" },
  { slug: "door-locks-hardware", name: "Door Locks & Hardware", group: "furniture_hardware" },
  { slug: "conduits-gi-boxes", name: "Conduits & GI Boxes", group: "electrical" },
  { slug: "lighting", name: "Lighting", group: "electrical" },
  { slug: "cpvc-pipes-overhead-tanks", name: "CPVC Pipes & Overhead Tanks", group: "plumbing_bath" },
  { slug: "ceiling-fans-exhaust", name: "Ceiling Fans & Exhaust", group: "electrical" },
  { slug: "home-appliances-power-backup", name: "Home Appliances & Power Backup", group: "electrical" },
  { slug: "general-hardware-tools", name: "General Hardware & Tools", group: "tools" },
];

const BRANDS = [
  "BuildPro", "AquaSeal", "Voltix", "TimberCraft", "GripFast",
  "LumenX", "SteelEdge", "FlowMax", "HomeCrown", "PowerCell",
];

interface SeedProduct {
  slug: string;
  title: string;
  brand: string;
  category: string;
  unitLabel: string;
  priceR: number;          // rupees
  compareAtR?: number;
  isDeal?: boolean;
  image?: string;          // /public path
  tiers?: [minQty: number, priceR: number][];
  specs?: { label: string; value: string }[];
}

const PRODUCTS: SeedProduct[] = [
  // Deals (match existing homepage cards and images)
  { slug: "ppc-cement-50kg", title: "PPC Cement, 50 kg Bag", brand: "BuildPro", category: "cement", unitLabel: "per bag", priceR: 320, compareAtR: 335, isDeal: true, image: "/products/ppc-cement-50kg.webp", tiers: [[10, 315], [30, 312], [100, 310]], specs: [{ label: "Grade", value: "PPC (Fly-ash based)" }, { label: "Weight", value: "50 kg" }] },
  { slug: "waterproof-primer-20l", title: "Interior Waterproofing Primer, 20 L", brand: "AquaSeal", category: "waterproofing", unitLabel: "per can", priceR: 4899, compareAtR: 6799, isDeal: true, image: "/products/waterproof-primer-20l.webp", specs: [{ label: "Coverage", value: "≈ 220 sq ft/L" }, { label: "Volume", value: "20 L" }] },
  { slug: "distemper-white-20kg", title: "Acrylic Distemper Paint, White, 20 kg", brand: "HomeCrown", category: "painting", unitLabel: "per bucket", priceR: 1549, compareAtR: 2499, isDeal: true, image: "/products/distemper-white-20kg.webp" },
  { slug: "gp-sealant-white", title: "General Purpose Sealant, White", brand: "GripFast", category: "fevicol", unitLabel: "per tube", priceR: 199, compareAtR: 645, isDeal: true, image: "/products/gp-sealant-white.webp" },
  { slug: "inverter-battery-combo", title: "1050 VA Inverter & 180 Ah Battery Combo", brand: "PowerCell", category: "home-appliances-power-backup", unitLabel: "per combo", priceR: 24499, compareAtR: 25599, isDeal: true, image: "/products/inverter-battery-combo.webp" },
  { slug: "ss-kitchen-sink", title: "Stainless Steel Kitchen Sink, Single Bowl", brand: "FlowMax", category: "kitchen-sinks-faucets", unitLabel: "per piece", priceR: 2899, compareAtR: 4299, isDeal: true, image: "/products/ss-kitchen-sink.webp", specs: [{ label: "Size", value: "24 x 18 in" }, { label: "Finish", value: "Satin" }] },

  // Cement & civil
  { slug: "opc-53-cement-50kg", title: "OPC 53 Grade Cement, 50 kg Bag", brand: "BuildPro", category: "cement", unitLabel: "per bag", priceR: 385, compareAtR: 440, tiers: [[10, 378], [30, 372], [100, 365]] },
  { slug: "white-cement-5kg", title: "White Cement, 5 kg Pack", brand: "BuildPro", category: "cement", unitLabel: "per pack", priceR: 210, compareAtR: 245 },
  { slug: "ready-mix-plaster-40kg", title: "Ready Mix Plaster, 40 kg Bag", brand: "BuildPro", category: "cement", unitLabel: "per bag", priceR: 310, tiers: [[20, 298]] },
  { slug: "tile-adhesive-20kg", title: "Tile Adhesive Type-2, 20 kg", brand: "GripFast", category: "tiling", unitLabel: "per bag", priceR: 420, compareAtR: 520, tiers: [[10, 405]] },
  { slug: "epoxy-grout-1kg", title: "Epoxy Tile Grout, 1 kg", brand: "GripFast", category: "tiling", unitLabel: "per kg", priceR: 540 },
  { slug: "vitrified-tile-cleaner-5l", title: "Vitrified Tile Cleaner, 5 L", brand: "AquaSeal", category: "tiling", unitLabel: "per can", priceR: 640 },

  // Painting & waterproofing
  { slug: "exterior-emulsion-20l", title: "Weatherproof Exterior Emulsion, 20 L", brand: "HomeCrown", category: "painting", unitLabel: "per bucket", priceR: 6299, compareAtR: 7499 },
  { slug: "wall-putty-40kg", title: "Acrylic Wall Putty, 40 kg", brand: "HomeCrown", category: "painting", unitLabel: "per bag", priceR: 980, compareAtR: 1150, tiers: [[10, 940]] },
  { slug: "roof-coat-membrane-20l", title: "Elastomeric Roof Coating, 20 L", brand: "AquaSeal", category: "waterproofing", unitLabel: "per can", priceR: 5450 },
  { slug: "crack-fill-paste-1kg", title: "Crack Fill Paste, 1 kg", brand: "AquaSeal", category: "waterproofing", unitLabel: "per tub", priceR: 240 },

  // Ply & adhesives
  { slug: "bwp-plywood-19mm", title: "BWP Marine Plywood 19 mm, 8x4 ft", brand: "TimberCraft", category: "plywood-mdf-hdhmr", unitLabel: "per sheet", priceR: 3150, compareAtR: 3590, tiers: [[10, 3040]] },
  { slug: "hdhmr-board-17mm", title: "HDHMR Board 17 mm, 8x4 ft", brand: "TimberCraft", category: "plywood-mdf-hdhmr", unitLabel: "per sheet", priceR: 2680 },
  { slug: "wood-adhesive-5kg", title: "Waterproof Wood Adhesive, 5 kg", brand: "GripFast", category: "fevicol", unitLabel: "per bucket", priceR: 1120, compareAtR: 1290 },

  // Electrical
  { slug: "fr-wire-1sqmm-90m", title: "FR Copper Wire 1.0 sq mm, 90 m Coil", brand: "Voltix", category: "wires-mcb-distribution-boards", unitLabel: "per coil", priceR: 1730, compareAtR: 2010, tiers: [[5, 1690], [20, 1650]] },
  { slug: "fr-wire-2-5sqmm-90m", title: "FR Copper Wire 2.5 sq mm, 90 m Coil", brand: "Voltix", category: "wires-mcb-distribution-boards", unitLabel: "per coil", priceR: 3480, compareAtR: 3890, tiers: [[5, 3390]] },
  { slug: "mcb-32a-c-curve", title: "MCB 32 A C-Curve, Single Pole", brand: "Voltix", category: "wires-mcb-distribution-boards", unitLabel: "per piece", priceR: 245 },
  { slug: "modular-switch-16a", title: "Modular Switch 16 A, White", brand: "Voltix", category: "switches-sockets", unitLabel: "per piece", priceR: 92, tiers: [[20, 84]] },
  { slug: "socket-6a-3pin", title: "3-Pin Socket 6 A, White", brand: "Voltix", category: "switches-sockets", unitLabel: "per piece", priceR: 110 },
  { slug: "pvc-conduit-25mm-3m", title: "PVC Conduit 25 mm, 3 m Length", brand: "SteelEdge", category: "conduits-gi-boxes", unitLabel: "per length", priceR: 96, tiers: [[50, 88]] },
  { slug: "gi-box-8x6", title: "GI Modular Box 8x6", brand: "SteelEdge", category: "conduits-gi-boxes", unitLabel: "per piece", priceR: 145 },
  { slug: "led-downlight-12w", title: "LED Downlight 12 W, Warm White", brand: "LumenX", category: "lighting", unitLabel: "per piece", priceR: 420, compareAtR: 520, tiers: [[10, 395]] },
  { slug: "led-batten-20w", title: "LED Batten 20 W, Cool Day Light", brand: "LumenX", category: "lighting", unitLabel: "per piece", priceR: 380 },
  { slug: "ceiling-fan-1200mm", title: "High-Speed Ceiling Fan 1200 mm", brand: "PowerCell", category: "ceiling-fans-exhaust", unitLabel: "per piece", priceR: 1680, compareAtR: 2050 },
  { slug: "exhaust-fan-250mm", title: "Exhaust Fan 250 mm, Kitchen/Bath", brand: "PowerCell", category: "ceiling-fans-exhaust", unitLabel: "per piece", priceR: 1150 },
  { slug: "water-heater-15l", title: "Storage Water Heater 15 L", brand: "PowerCell", category: "home-appliances-power-backup", unitLabel: "per piece", priceR: 7290, compareAtR: 8400 },

  // Plumbing & bath
  { slug: "cpvc-pipe-1in-3m", title: "CPVC Pipe 1 in, 3 m Length", brand: "FlowMax", category: "cpvc-pipes-overhead-tanks", unitLabel: "per length", priceR: 385, tiers: [[25, 362]] },
  { slug: "overhead-tank-1000l", title: "Overhead Water Tank 1000 L, 3-Layer", brand: "FlowMax", category: "cpvc-pipes-overhead-tanks", unitLabel: "per piece", priceR: 7150, compareAtR: 7900 },
  { slug: "wall-hung-wc", title: "Wall-Hung WC with Slim Seat", brand: "FlowMax", category: "sanitary-bath-fittings", unitLabel: "per set", priceR: 8990, compareAtR: 11500 },
  { slug: "single-lever-basin-mixer", title: "Single-Lever Basin Mixer, Chrome", brand: "FlowMax", category: "sanitary-bath-fittings", unitLabel: "per piece", priceR: 2450 },
  { slug: "kitchen-faucet-pullout", title: "Pull-Out Kitchen Faucet, Brushed", brand: "FlowMax", category: "kitchen-sinks-faucets", unitLabel: "per piece", priceR: 3890, compareAtR: 4650 },

  // Furniture hardware
  { slug: "soft-close-hinge", title: "Soft-Close Cabinet Hinge, Clip-On", brand: "SteelEdge", category: "hinges-channels-handles", unitLabel: "per piece", priceR: 145, tiers: [[20, 132], [50, 124]] },
  { slug: "telescopic-channel-18in", title: "Telescopic Drawer Channel 18 in, Pair", brand: "SteelEdge", category: "hinges-channels-handles", unitLabel: "per pair", priceR: 320 },
  { slug: "ss-basket-pullout", title: "SS Kitchen Pull-Out Basket, 21 in", brand: "SteelEdge", category: "kitchen-systems-accessories", unitLabel: "per piece", priceR: 1450, compareAtR: 1750 },
  { slug: "wardrobe-hydraulic-lift", title: "Wardrobe Hydraulic Lift-Up Fitting", brand: "SteelEdge", category: "wardrobe-bed-fittings", unitLabel: "per set", priceR: 2250 },
  { slug: "mortise-lock-set", title: "Mortise Door Lock Set, Brass Finish", brand: "SteelEdge", category: "door-locks-hardware", unitLabel: "per set", priceR: 1680, compareAtR: 1990 },
  { slug: "smart-door-lock", title: "Smart Door Lock, Fingerprint + PIN", brand: "SteelEdge", category: "door-locks-hardware", unitLabel: "per piece", priceR: 10990, compareAtR: 13500 },

  // Tools
  { slug: "measuring-tape-5m", title: "Measuring Tape 5 m", brand: "GripFast", category: "general-hardware-tools", unitLabel: "per piece", priceR: 165 },
  { slug: "spirit-level-600mm", title: "Spirit Level 600 mm, Aluminium", brand: "GripFast", category: "general-hardware-tools", unitLabel: "per piece", priceR: 540 },
  { slug: "drywall-screws-box", title: "Drywall Screws 25 mm, Box of 500", brand: "GripFast", category: "general-hardware-tools", unitLabel: "per box", priceR: 380, tiers: [[10, 355]] },
];

const R = (rupees: number) => Math.round(rupees * 100); // to paise

async function main() {
  // Categories (images already shipped in /public/categories)
  for (const [i, c] of CATEGORIES.entries()) {
    await db.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, group: c.group, isBulk: !!c.bulk, sortOrder: i },
      create: {
        slug: c.slug, name: c.name, group: c.group, isBulk: !!c.bulk, sortOrder: i,
        imageUrl: `/categories/${c.slug}.webp`,
        seoTitle: `${c.name} — 60 Min Delivery in Srinagar`,
        seoDescription: `Buy ${c.name.toLowerCase()} at trade prices with 60-minute delivery across Srinagar.`,
      },
    });
  }

  for (const name of BRANDS) {
    const slug = name.toLowerCase();
    await db.brand.upsert({ where: { slug }, update: {}, create: { slug, name } });
  }

  const warehouse = await db.warehouse.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: { id: "00000000-0000-0000-0000-000000000001", name: "Srinagar Central", city: "Srinagar", pincode: "190001" },
  });

  // Serviceable pincodes: central Srinagar fast, wider zone slower
  for (let i = 1; i <= 25; i++) {
    const pincode = `1900${String(i).padStart(2, "0")}`;
    await db.serviceablePincode.upsert({
      where: { pincode },
      update: {},
      create: {
        pincode, warehouseId: warehouse.id,
        etaMinutes: i <= 12 ? 60 : 120,
        deliveryFeePaise: i <= 12 ? 0 : R(49),
        codAllowed: true,
      },
    });
  }

  const brandIds = new Map(
    (await db.brand.findMany()).map((b) => [b.name, b.id])
  );
  const categoryIds = new Map(
    (await db.category.findMany()).map((c) => [c.slug, c.id])
  );

  for (const p of PRODUCTS) {
    const product = await db.product.upsert({
      where: { slug: p.slug },
      update: { title: p.title, isDeal: !!p.isDeal },
      create: {
        slug: p.slug,
        title: p.title,
        brandId: brandIds.get(p.brand)!,
        categoryId: categoryIds.get(p.category)!,
        unitLabel: p.unitLabel,
        isDeal: !!p.isDeal,
        specs: p.specs ?? undefined,
        description: `${p.title} — genuine ${p.brand} quality, delivered to your site in Srinagar within the hour. ${
          p.tiers ? "Bulk prices unlock automatically at higher quantities." : ""
        }`.trim(),
        images: {
          create: {
            url: p.image ?? `/categories/${p.category}.webp`,
            alt: p.title,
            isPrimary: true,
          },
        },
      },
      include: { variants: true },
    });

    const sku = `VE-${p.slug.toUpperCase().slice(0, 24)}`;
    const variant = await db.productVariant.upsert({
      where: { sku },
      update: { pricePaise: R(p.priceR), compareAtPaise: p.compareAtR ? R(p.compareAtR) : null },
      create: {
        productId: product.id,
        sku,
        name: p.unitLabel.replace("per ", "").trim(),
        pricePaise: R(p.priceR),
        compareAtPaise: p.compareAtR ? R(p.compareAtR) : null,
        isDefault: true,
      },
    });

    if (p.tiers) {
      for (const [minQty, priceR] of p.tiers) {
        await db.bulkPriceTier.upsert({
          where: { variantId_minQty: { variantId: variant.id, minQty } },
          update: { pricePaise: R(priceR) },
          create: { variantId: variant.id, minQty, pricePaise: R(priceR) },
        });
      }
    }

    await db.inventory.upsert({
      where: { variantId_warehouseId: { variantId: variant.id, warehouseId: warehouse.id } },
      update: {},
      create: { variantId: variant.id, warehouseId: warehouse.id, qtyOnHand: 500 },
    });
  }

  await db.coupon.upsert({
    where: { code: "FIRST3" },
    update: {},
    create: {
      code: "FIRST3",
      type: "free_delivery",
      minOrderPaise: R(500),
      firstNOrders: 3,
      perUserLimit: 3,
    },
  });

  console.log(`Seeded ${CATEGORIES.length} categories, ${BRANDS.length} brands, ${PRODUCTS.length} products.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
