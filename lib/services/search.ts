import "server-only";
import { db } from "@/lib/db";
import { expandedSearchTerms, matchesSearchName } from "@/lib/search-terms";

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

  const deduplicatedTerms = expandedSearchTerms(primaryTerm, synonymRecords);

  // Filter short terms at the database before LIMIT: post-filtering a capped
  // result could let unrelated "Accessories" rows crowd out the actual ACC.
  const matchingIds = await db.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM products p
    JOIN brands b ON b.id = p.brand_id JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'published' AND EXISTS (
      SELECT 1 FROM unnest(${deduplicatedTerms}::text[]) term
      WHERE CASE WHEN char_length(term) <= 3 THEN
        term = ANY(regexp_split_to_array(lower(p.title || ' ' || b.name || ' ' || c.name), '[^a-z0-9]+'))
      ELSE lower(p.title) LIKE '%' || term || '%'
        OR lower(b.name) LIKE '%' || term || '%'
        OR lower(c.name) LIKE '%' || term || '%' END
    )`;
  const products = await db.product.findMany({
    where: {
      status: "published",
      id: { in: matchingIds.map(p => p.id) },
    },
    /* `ratingCount` is always zero (ISS-034), so this ranked nothing. Deals
       first, then newest — the order it actually produced. */
    orderBy: [{ isDeal: "desc" }, { createdAt: "desc" }],
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
    categories: categories.filter(c => deduplicatedTerms.some(t => matchesSearchName(c.name, t))).slice(0, 3),
    brands: brands.filter(b => deduplicatedTerms.some(t => matchesSearchName(b.name, t))).slice(0, 3),
  };
}
