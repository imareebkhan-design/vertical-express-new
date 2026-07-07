import "server-only";
import { db } from "@/lib/db";

export interface SearchSuggestions {
  products: { slug: string; title: string; brandName: string; imageUrl: string | null; pricePaise: number }[];
  categories: { slug: string; name: string }[];
  brands: { slug: string; name: string }[];
}

/**
 * Typeahead suggestions. Postgres ILIKE now; swap this function's body for
 * Typesense/Meilisearch once SKU count grows — the interface stays stable.
 */
export async function getSuggestions(query: string): Promise<SearchSuggestions> {
  const q = query.trim();
  if (q.length < 2) return { products: [], categories: [], brands: [] };

  const [products, categories, brands] = await Promise.all([
    db.product.findMany({
      where: {
        status: "published",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { brand: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      orderBy: [{ isDeal: "desc" }, { ratingCount: "desc" }],
      take: 6,
      include: {
        brand: { select: { name: true } },
        images: { where: { isPrimary: true }, take: 1 },
        variants: { where: { isDefault: true }, take: 1, select: { pricePaise: true } },
      },
    }),
    db.category.findMany({
      where: { isActive: true, name: { contains: q, mode: "insensitive" } },
      take: 3,
      select: { slug: true, name: true },
    }),
    db.brand.findMany({
      where: { isActive: true, name: { contains: q, mode: "insensitive" } },
      take: 3,
      select: { slug: true, name: true },
    }),
  ]);

  return {
    products: products.map((p) => ({
      slug: p.slug,
      title: p.title,
      brandName: p.brand.name,
      imageUrl: p.images[0]?.url ?? null,
      pricePaise: p.variants[0]?.pricePaise ?? 0,
    })),
    categories,
    brands,
  };
}
