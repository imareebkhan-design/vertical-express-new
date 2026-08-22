/**
 * Seeds service categories from lib/services.ts into the DB so the Services
 * page and admin can read them dynamically. Idempotent (upsert by slug).
 */
import "dotenv/config";
import { PrismaClient } from "../prisma/generated/client/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SERVICE_CATEGORIES } from "../lib/services";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

// Map lucide icon components to stable string keys for DB storage.
const ICON_KEYS: Record<string, string> = {
  "complete-home-construction": "Home",
  "home-renovation": "Hammer",
  "interior-design": "Sofa",
  "architectural-design": "PencilRuler",
  "civil-construction": "Blocks",
  carpentry: "Armchair",
  "false-ceiling": "Layers",
  "tile-installation": "Grid3x3",
  "painting-services": "PaintRoller",
  plumbing: "ShowerHead",
  "electrical-services": "Zap",
  "aluminium-glass": "Frame",
  fabrication: "Wrench",
  "exterior-development": "Trees",
  "deep-cleaning": "Sparkles",
  "commercial-construction": "Building2",
};

async function main() {
  for (const [i, cat] of SERVICE_CATEGORIES.entries()) {
    await db.serviceCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, blurb: cat.blurb, sortOrder: i },
      create: {
        slug: cat.slug,
        name: cat.name,
        blurb: cat.blurb,
        iconKey: ICON_KEYS[cat.slug] ?? "Wrench",
        sortOrder: i,
      },
    });
    // One default service per category (extendable in admin later).
    await db.service.upsert({
      where: { slug: cat.slug },
      update: {},
      create: {
        slug: cat.slug,
        categorySlug: cat.slug,
        name: cat.name,
        description: cat.blurb,
        faqs: [],
      },
    });
  }
  console.log(`Seeded ${SERVICE_CATEGORIES.length} service categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
