import "server-only";
import { db } from "@/lib/db";

export interface SearchSuggestions {
  products: { slug: string; title: string; brandName: string; imageUrl: string | null; pricePaise: number }[];
  categories: { slug: string; name: string }[];
  brands: { slug: string; name: string }[];
}

/**
 * Typeahead suggestions with synonym expansion and exact/typo priority.
 */
export async function getSuggestions(query: string): Promise<SearchSuggestions> {
  const q = query.trim();
  if (q.length < 2) return { products: [], categories: [], brands: [] };

  const primaryTerm = q.toLowerCase();

  // 1. Resolve synonyms for suggestion tokens
  const tokens = primaryTerm.split(/\s+/).filter(Boolean);
  const synonymRecords = await db.synonym.findMany({
    where: {
      OR: [
        { word: { in: tokens } },
        { synonyms: { contains: primaryTerm, mode: "insensitive" } },
      ],
    },
  });

  const expandedTerms = [primaryTerm];
  for (const rec of synonymRecords) {
    if (tokens.includes(rec.word)) {
      expandedTerms.push(...rec.synonyms.split(",").map(s => s.trim().toLowerCase()));
    }
    const list = rec.synonyms.split(",").map(s => s.trim().toLowerCase());
    for (const token of tokens) {
      if (list.includes(token)) {
        expandedTerms.push(rec.word);
        expandedTerms.push(...list);
      }
    }
  }

  const deduplicatedTerms = Array.from(new Set(expandedTerms))
    .filter(Boolean);

  // 2. Fetch products matching any of the terms
  const products = await db.product.findMany({
    where: {
      status: "published",
      OR: deduplicatedTerms.flatMap((term) => [
        { title: { contains: term, mode: "insensitive" } },
        { brand: { name: { contains: term, mode: "insensitive" } } },
        { category: { name: { contains: term, mode: "insensitive" } } },
      ]),
    },
    orderBy: [{ isDeal: "desc" }, { ratingCount: "desc" }],
    take: 12, // Take extra to allow for deduplication
    include: {
      brand: { select: { name: true } },
      images: { where: { isPrimary: true }, take: 1 },
      variants: { where: { isDefault: true }, take: 1, select: { pricePaise: true } },
    },
  });

  // 3. Fetch categories matching any of the terms
  const categories = await db.category.findMany({
    where: {
      isActive: true,
      OR: deduplicatedTerms.map((term) => ({
        name: { contains: term, mode: "insensitive" },
      })),
    },
    take: 3,
    select: { slug: true, name: true },
  });

  // 4. Fetch brands matching any of the terms
  const brands = await db.brand.findMany({
    where: {
      isActive: true,
      OR: deduplicatedTerms.map((term) => ({
        name: { contains: term, mode: "insensitive" },
      })),
    },
    take: 3,
    select: { slug: true, name: true },
  });

  // 5. Deduplicate and format product results (limit to 6)
  const seenProductIds = new Set<string>();
  const uniqueProducts = products
    .filter((p) => {
      if (seenProductIds.has(p.id)) return false;
      seenProductIds.add(p.id);
      return true;
    })
    .slice(0, 6)
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      brandName: p.brand.name,
      imageUrl: p.images[0]?.url ?? null,
      pricePaise: p.variants[0]?.pricePaise ?? 0,
    }));

  return {
    products: uniqueProducts,
    categories: categories.slice(0, 3),
    brands: brands.slice(0, 3),
  };
}
