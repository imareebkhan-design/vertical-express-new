import "server-only";
import { Prisma } from "@/prisma/generated/client";
import { db } from "@/lib/db";
import { unstable_cache } from "next/cache";
export type CatalogSort = "popular" | "price_asc" | "price_desc" | "newest" | "discount";

/** Serializable product card payload shared by PLP, search, deals, wishlist. */
export interface CatalogItem {
  id: string;
  slug: string;
  title: string;
  brandName: string;
  categorySlug: string;
  imageUrl: string | null;
  unitLabel: string;
  variantId: string;
  pricePaise: number;
  compareAtPaise: number | null;
  hasBulkTiers: boolean;
  ratingAvg: number;
  ratingCount: number;
  inStock: boolean;
}

export interface CatalogQuery {
  categorySlug?: string;
  search?: string;
  brandSlugs?: string[];
  minPaise?: number;
  maxPaise?: number;
  sort?: CatalogSort;
  page?: number;
  perPage?: number;
  dealsOnly?: boolean;
}

export interface CatalogFacets {
  brands: { slug: string; name: string; count: number }[];
  priceRange: { minPaise: number; maxPaise: number };
}

export interface CatalogResult {
  items: CatalogItem[];
  total: number;
  page: number;
  perPage: number;
  facets: CatalogFacets;
}

const PER_PAGE_DEFAULT = 24;
const PER_PAGE_MAX = 48;

function buildWhere(q: CatalogQuery): Prisma.ProductWhereInput {
  return {
    status: "published",
    ...(q.categorySlug ? { category: { slug: q.categorySlug } } : {}),
    ...(q.dealsOnly ? { isDeal: true } : {}),
    ...(q.brandSlugs?.length ? { brand: { slug: { in: q.brandSlugs } } } : {}),
    ...(q.search
      ? {
          OR: [
            { title: { contains: q.search, mode: "insensitive" } },
            { brand: { name: { contains: q.search, mode: "insensitive" } } },
            { category: { name: { contains: q.search, mode: "insensitive" } } },
          ],
        }
      : {}),
    variants: {
      some: {
        isDefault: true,
        isActive: true,
        ...(q.minPaise != null || q.maxPaise != null
          ? { pricePaise: { gte: q.minPaise ?? 0, lte: q.maxPaise ?? 2_000_000_000 } }
          : {}),
      },
    },
  };
}

function orderBy(sort: CatalogSort | undefined): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" }];
    case "popular":
    default:
      return [{ ratingCount: "desc" }, { createdAt: "desc" }];
    // price/discount sorts happen in JS after fetch of the page window —
    // acceptable at current catalog size; moves to SQL with the search engine.
  }
}

type ProductWithRefs = Prisma.ProductGetPayload<{
  include: {
    brand: true;
    category: { select: { slug: true } };
    images: { where: { isPrimary: true }; take: 1 };
    variants: {
      where: { isDefault: true };
      include: {
        bulkTiers: { select: { id: true }; take: 1 };
        inventory: { select: { qtyOnHand: true; qtyReserved: true } };
      };
    };
  };
}>;

function toItem(p: ProductWithRefs): CatalogItem | null {
  const variant = p.variants[0];
  if (!variant) return null;
  const available = variant.inventory?.reduce((sum, i) => sum + (i.qtyOnHand - i.qtyReserved), 0) ?? 0;
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    brandName: p.brand.name,
    categorySlug: p.category.slug,
    imageUrl: p.images[0]?.url ?? null,
    unitLabel: p.unitLabel,
    variantId: variant.id,
    pricePaise: variant.pricePaise,
    compareAtPaise: variant.compareAtPaise,
    hasBulkTiers: variant.bulkTiers.length > 0,
    ratingAvg: Number(p.ratingAvg),
    ratingCount: p.ratingCount,
    inStock: available > 0,
  };
}

export async function listProducts(q: CatalogQuery): Promise<CatalogResult> {
  const page = Math.max(1, q.page ?? 1);
  const perPage = Math.min(PER_PAGE_MAX, Math.max(1, q.perPage ?? PER_PAGE_DEFAULT));

  // If there is no search query active, fall back to standard Prisma behavior
  if (!q.search || !q.search.trim()) {
    const where = buildWhere(q);
    const priceSort = q.sort === "price_asc" || q.sort === "price_desc" || q.sort === "discount";

    const [rows, total, brandGroups, priceAgg] = await Promise.all([
      db.product.findMany({
        where,
        orderBy: orderBy(q.sort),
        ...(priceSort ? {} : { skip: (page - 1) * perPage, take: perPage }),
        include: {
          brand: true,
          category: { select: { slug: true } },
          images: { where: { isPrimary: true }, take: 1 },
          variants: {
            where: { isDefault: true },
            include: {
              bulkTiers: { select: { id: true }, take: 1 },
              inventory: { select: { qtyOnHand: true, qtyReserved: true } },
            },
          },
        },
      }),
      db.product.count({ where }),
      db.product.groupBy({
        by: ["brandId"],
        where: { ...where, brand: undefined },
        _count: true,
      }),
      db.productVariant.aggregate({
        where: { isDefault: true, product: { ...where, variants: undefined } },
        _min: { pricePaise: true },
        _max: { pricePaise: true },
      }),
    ]);

    let items = rows.map(toItem).filter((x): x is CatalogItem => x !== null);

    if (priceSort) {
      items.sort((a, b) => {
        if (q.sort === "price_asc") return a.pricePaise - b.pricePaise;
        if (q.sort === "price_desc") return b.pricePaise - a.pricePaise;
        const dA = a.compareAtPaise ? (a.compareAtPaise - a.pricePaise) / a.compareAtPaise : 0;
        const dB = b.compareAtPaise ? (b.compareAtPaise - b.pricePaise) / b.compareAtPaise : 0;
        return dB - dA;
      });
      items = items.slice((page - 1) * perPage, page * perPage);
    }

    const brandIds = brandGroups.map((g) => g.brandId);
    const brands = brandIds.length
      ? await db.brand.findMany({ where: { id: { in: brandIds } }, orderBy: { name: "asc" } })
      : [];
    const countByBrand = new Map(brandGroups.map((g) => [g.brandId, g._count]));

    return {
      items,
      total,
      page,
      perPage,
      facets: {
        brands: brands.map((b) => ({ slug: b.slug, name: b.name, count: countByBrand.get(b.id) ?? 0 })),
        priceRange: {
          minPaise: priceAgg._min.pricePaise ?? 0,
          maxPaise: priceAgg._max.pricePaise ?? 0,
        },
      },
    };
  }

  // SEARCH INTELLIGENCE ENGINE (ISS-020)
  const rawSearchQuery = q.search.trim();
  const primaryTerm = rawSearchQuery.toLowerCase();
  
  // 1. Resolve synonyms matching the tokens in the query
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

  // Deduplicate synonym terms, leaving out the primary query term
  const synonymsList = Array.from(new Set(expandedTerms))
    .filter((t) => t && t !== primaryTerm);

  // 2. Build dynamic PostgreSQL filter queries and args to prevent injection
  const conditions = [
    "p.status = 'published'",
  ];

  const queryArgs: unknown[] = [
    primaryTerm,             // $1
    `${primaryTerm}%`,       // $2
    synonymsList,            // $3 (text[])
    `%${primaryTerm}%`,      // $4
  ];

  let argIndex = 5;

  const searchCond = `(
    LOWER(p.title) LIKE LOWER($4) OR
    LOWER(b.name) LIKE LOWER($4) OR
    LOWER(c.name) LIKE LOWER($4) OR
    EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND LOWER(pv.sku) LIKE LOWER($4)) OR
    similarity(p.title, $1) >= 0.18 OR
    EXISTS (
      SELECT 1 FROM unnest($3::text[]) term 
      WHERE LOWER(p.title) LIKE ('%' || term || '%') 
         OR LOWER(b.name) = term 
         OR LOWER(c.name) = term
    )
  )`;
  conditions.push(searchCond);

  if (q.categorySlug) {
    conditions.push(`c.slug = $${argIndex}`);
    queryArgs.push(q.categorySlug);
    argIndex++;
  }

  if (q.dealsOnly) {
    conditions.push("p.is_deal = true");
  }

  if (q.brandSlugs && q.brandSlugs.length > 0) {
    conditions.push(`b.slug = ANY($${argIndex}::text[])`);
    queryArgs.push(q.brandSlugs);
    argIndex++;
  }

  if (q.minPaise != null) {
    conditions.push(`EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_default = true AND pv.price_paise >= $${argIndex})`);
    queryArgs.push(q.minPaise);
    argIndex++;
  }

  if (q.maxPaise != null) {
    conditions.push(`EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_default = true AND pv.price_paise <= $${argIndex})`);
    queryArgs.push(q.maxPaise);
    argIndex++;
  }

  // 3. Count total matched products
  const countSql = `
    SELECT COUNT(*)::int as count
    FROM products p
    JOIN brands b ON p.brand_id = b.id
    JOIN categories c ON p.category_id = c.id
    WHERE ${conditions.join(" AND ")};
  `;
  const countResult = await db.$queryRawUnsafe<{ count: number }[]>(countSql, ...queryArgs);
  const total = countResult[0]?.count ?? 0;

  // 4. Fetch matched products with limit/offset and dynamic scoring
  let orderByClause = "ORDER BY search_score DESC, p.rating_count DESC, p.created_at DESC";
  if (q.sort === "newest") {
    orderByClause = "ORDER BY search_score DESC, p.created_at DESC";
  } else if (q.sort === "price_asc") {
    orderByClause = "ORDER BY search_score DESC, (SELECT price_paise FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_default = true) ASC";
  } else if (q.sort === "price_desc") {
    orderByClause = "ORDER BY search_score DESC, (SELECT price_paise FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_default = true) DESC";
  } else if (q.sort === "discount") {
    orderByClause = "ORDER BY search_score DESC, (SELECT (compare_at_paise - price_paise)::float / compare_at_paise FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_default = true AND compare_at_paise > 0) DESC NULLS LAST";
  }

  const selectSql = `
    SELECT
      p.id,
      p.slug,
      p.title,
      b.name as brand_name,
      c.slug as category_slug,
      p.unit_label,
      p.rating_avg,
      p.rating_count,
      p.is_deal,
      (
        (CASE WHEN LOWER(p.title) = LOWER($1) THEN 100.0 ELSE 0.0 END) +
        (CASE WHEN EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND LOWER(pv.sku) = LOWER($1)) THEN 95.0 ELSE 0.0 END) +
        (CASE WHEN LOWER(p.title) LIKE LOWER($2) THEN 90.0 ELSE 0.0 END) +
        (CASE WHEN LOWER(b.name) = LOWER($1) THEN 80.0 ELSE 0.0 END) +
        (CASE WHEN LOWER(c.name) = LOWER($1) THEN 70.0 ELSE 0.0 END) +
        (CASE WHEN EXISTS (
           SELECT 1 FROM unnest($3::text[]) term 
           WHERE LOWER(p.title) LIKE ('%' || term || '%') 
              OR LOWER(b.name) = term 
              OR LOWER(c.name) = term
         ) THEN 60.0 ELSE 0.0 END) +
        (CASE WHEN similarity(p.title, $1) >= 0.18 THEN 50.0 * similarity(p.title, $1) ELSE 0.0 END) +
        (CASE WHEN LOWER(p.title) LIKE LOWER($4) THEN 40.0 ELSE 0.0 END) +
        LEAST(20.0, p.rating_count * 0.2) +
        LEAST(15.0, (
          SELECT COUNT(*)::float * 2.0 
          FROM order_items oi 
          JOIN product_variants pv ON oi.variant_id = pv.id 
          WHERE pv.product_id = p.id
        ))
      ) as search_score
    FROM products p
    JOIN brands b ON p.brand_id = b.id
    JOIN categories c ON p.category_id = c.id
    WHERE ${conditions.join(" AND ")}
    ${orderByClause}
    LIMIT $${argIndex} OFFSET $${argIndex + 1};
  `;

  const limit = perPage;
  const offset = (page - 1) * perPage;

  interface SearchRow {
    id: string;
    slug: string;
    title: string;
    brand_name: string;
    category_slug: string;
    unit_label: string;
    rating_avg: Prisma.Decimal;
    rating_count: number;
    is_deal: boolean;
    search_score: number;
  }

  const rows = await db.$queryRawUnsafe<SearchRow[]>(
    selectSql,
    ...queryArgs,
    limit,
    offset
  );

  // 5. Hydrate references cleanly to prevent N+1 queries
  const productIds = rows.map((r) => r.id);
  const details = productIds.length
    ? await db.product.findMany({
        where: { id: { in: productIds } },
        include: {
          images: { where: { isPrimary: true }, take: 1 },
          variants: {
            where: { isDefault: true },
            include: {
              bulkTiers: { select: { id: true }, take: 1 },
              inventory: { select: { qtyOnHand: true, qtyReserved: true } },
            },
          },
        },
      })
    : [];

  const detailsMap = new Map(details.map((d) => [d.id, d]));
  let items: CatalogItem[] = [];

  for (const row of rows) {
    const p = detailsMap.get(row.id);
    if (!p) continue;
    const variant = p.variants[0];
    if (!variant) continue;
    const available = variant.inventory?.reduce((sum, i) => sum + (i.qtyOnHand - i.qtyReserved), 0) ?? 0;

    items.push({
      id: p.id,
      slug: p.slug,
      title: p.title,
      brandName: row.brand_name,
      categorySlug: row.category_slug,
      imageUrl: p.images[0]?.url ?? null,
      unitLabel: p.unitLabel,
      variantId: variant.id,
      pricePaise: variant.pricePaise,
      compareAtPaise: variant.compareAtPaise,
      hasBulkTiers: variant.bulkTiers.length > 0,
      ratingAvg: Number(p.ratingAvg),
      ratingCount: p.ratingCount,
      inStock: available > 0,
    });
  }

  // 6. Query facets dynamically scoped to matched product IDs
  const allMatchedSql = `
    SELECT p.id, p.brand_id
    FROM products p
    JOIN brands b ON p.brand_id = b.id
    JOIN categories c ON p.category_id = c.id
    WHERE ${conditions.join(" AND ")};
  `;
  const allMatchedRows = await db.$queryRawUnsafe<{ id: string; brand_id: string }[]>(
    allMatchedSql,
    ...queryArgs
  );
  const matchedProductIds = allMatchedRows.map((r) => r.id);

  const [brandGroups, priceAgg] = matchedProductIds.length
    ? await Promise.all([
        db.product.groupBy({
          by: ["brandId"],
          where: { id: { in: matchedProductIds } },
          _count: true,
        }),
        db.productVariant.aggregate({
          where: { isDefault: true, productId: { in: matchedProductIds } },
          _min: { pricePaise: true },
          _max: { pricePaise: true },
        }),
      ])
    : [[], { _min: { pricePaise: null }, _max: { pricePaise: null } }];

  const brandIds = brandGroups.map((g) => g.brandId);
  const brands = brandIds.length
    ? await db.brand.findMany({ where: { id: { in: brandIds } }, orderBy: { name: "asc" } })
    : [];
  const countByBrand = new Map(brandGroups.map((g) => [g.brandId, g._count]));

  return {
    items,
    total,
    page,
    perPage,
    facets: {
      brands: brands.map((b) => ({ slug: b.slug, name: b.name, count: countByBrand.get(b.id) ?? 0 })),
      priceRange: {
        minPaise: priceAgg._min.pricePaise ?? 0,
        maxPaise: priceAgg._max.pricePaise ?? 0,
      },
    },
  };
}

export interface ProductDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  brandName: string;
  brandSlug: string;
  categoryName: string;
  categorySlug: string;
  unitLabel: string;
  specs: { label: string; value: string }[];
  ratingAvg: number;
  ratingCount: number;
  images: { url: string; alt: string }[];
  variants: {
    id: string;
    name: string;
    sku: string;
    pricePaise: number;
    compareAtPaise: number | null;
    isDefault: boolean;
    bulkTiers: { minQty: number; pricePaise: number }[];
  }[];
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const p = await db.product.findFirst({
    where: { slug, status: "published" },
    include: {
      brand: true,
      category: true,
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
      variants: {
        where: { isActive: true },
        orderBy: { isDefault: "desc" },
        include: { bulkTiers: { orderBy: { minQty: "asc" } } },
      },
    },
  });
  if (!p) return null;

  const specs = Array.isArray(p.specs)
    ? (p.specs as { label: string; value: string }[])
    : [];

  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    brandName: p.brand.name,
    brandSlug: p.brand.slug,
    categoryName: p.category.name,
    categorySlug: p.category.slug,
    unitLabel: p.unitLabel,
    specs,
    ratingAvg: Number(p.ratingAvg),
    ratingCount: p.ratingCount,
    images: p.images.map((i) => ({ url: i.url, alt: i.alt })),
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      pricePaise: v.pricePaise,
          compareAtPaise: v.compareAtPaise,
      isDefault: v.isDefault,
      bulkTiers: v.bulkTiers.map((t) => ({ minQty: t.minQty, pricePaise: t.pricePaise })),
    })),
  };
}

/** Products in the same category, excluding the current one. */
async function getRelatedProductsRaw(
  categorySlug: string,
  excludeSlug: string,
  take = 6
): Promise<CatalogItem[]> {
  const rows = await db.product.findMany({
    where: {
      status: "published",
      category: { slug: categorySlug },
      slug: { not: excludeSlug },
    },
    orderBy: [{ isDeal: "desc" }, { ratingCount: "desc" }],
    take,
    include: {
      brand: true,
      category: { select: { slug: true } },
      images: { where: { isPrimary: true }, take: 1 },
      variants: {
        where: { isDefault: true },
        include: {
          bulkTiers: { select: { id: true }, take: 1 },
          inventory: { select: { qtyOnHand: true, qtyReserved: true } },
        },
      },
    },
  });
  return rows.map(toItem).filter((x): x is CatalogItem => x !== null);
}

export const getRelatedProducts = unstable_cache(
  async (categorySlug: string, excludeSlug: string, take = 6) => getRelatedProductsRaw(categorySlug, excludeSlug, take),
  ["catalog-related-products"],
  { revalidate: 300, tags: ["catalog"] }
);

async function getDealsRaw(take = 8): Promise<CatalogItem[]> {
  const rows = await db.product.findMany({
    where: { status: "published", isDeal: true },
    orderBy: { updatedAt: "desc" },
    take,
    include: {
      brand: true,
      category: { select: { slug: true } },
      images: { where: { isPrimary: true }, take: 1 },
      variants: {
        where: { isDefault: true },
        include: {
          bulkTiers: { select: { id: true }, take: 1 },
          inventory: { select: { qtyOnHand: true, qtyReserved: true } },
        },
      },
    },
  });
  return rows.map(toItem).filter((x): x is CatalogItem => x !== null);
}

export const getDeals = unstable_cache(
  async (take = 8) => getDealsRaw(take),
  ["catalog-deals"],
  { revalidate: 300, tags: ["catalog"] }
);

export async function listProductSlugs(): Promise<string[]> {
  const rows = await db.product.findMany({
    where: { status: "published" },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}

export async function getCategoryBySlug(slug: string) {
  return db.category.findFirst({ where: { slug, isActive: true } });
}

async function listCategoriesRaw() {
  return db.category.findMany({
    where: { isActive: true },
    orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
  });
}

export const listCategories = unstable_cache(
  async () => listCategoriesRaw(),
  ["catalog-categories"],
  { revalidate: 600, tags: ["catalog"] }
);

export async function listCategorySlugs(): Promise<string[]> {
  const rows = await db.category.findMany({ where: { isActive: true }, select: { slug: true } });
  return rows.map((r) => r.slug);
}
