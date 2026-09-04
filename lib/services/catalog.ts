import "server-only";
import { attributeConfigFor, attributesOf } from "@/lib/catalog-attributes";
import { Prisma } from "@/prisma/generated/client/client";
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
  /** Heavy material — drives the delivery-speed chip. From Category.isBulk. */
  categoryIsBulk: boolean;
  /** Product.deliverySpeed — overrides the category. Null means use the category. */
  deliverySpeed: "express" | "scheduled" | null;
  imageUrl: string | null;
  unitLabel: string;
  variantId: string;
  pricePaise: number;
  compareAtPaise: number | null;
  hasBulkTiers: boolean;
  /** The product's own Grade attribute, when it carries one. */
  gradeLabel: string | null;
  /** Every attribute the product carries, keyed by label — "Type", "Size",
   *  "Finish", "Room". Drives the category rail and the sidebar filters, and
   *  is read from the record, never composed. */
  attributes: Record<string, string>;
  ratingAvg: number;
  ratingCount: number;
  inStock: boolean;
}

export interface CatalogQuery {
  categorySlug?: string;
  /** Attribute filters, label -> selected value, e.g. { Type: "Vitrified" }. */
  attrs?: Record<string, string>;
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
  /** Attribute groups for this category, in the order catalog-attributes.ts
   *  configures, each carrying only the values actually stocked. Empty when the
   *  catalogue has no attribute data for the category. */
  attributes: { label: string; values: { value: string; count: number }[] }[];
}

/**
 * Counts attribute values across the matched products.
 *
 * Derived from the items themselves rather than a separate query: the values
 * live in a JSON column, so there is nothing to group by in SQL, and the page
 * window is small enough that counting in memory is honest and cheap.
 */
function buildAttributeFacets(
  items: CatalogItem[],
  categorySlug: string | undefined
): CatalogFacets["attributes"] {
  if (!categorySlug) return [];
  const { attributes } = attributeConfigFor(categorySlug);

  return attributes
    .map((label) => {
      const counts = new Map<string, number>();
      for (const item of items) {
        const value = item.attributes[label];
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      return {
        label,
        values: [...counts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
      };
    })
    .filter((group) => group.values.length > 0);
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
      /* `ratingCount` is zero on every product and nothing writes it — there is
         no Review model (ISS-034). As a first sort key it was inert, so every
         listing silently fell through to the second key and came out
         newest-first while the control above it said "Popular".

         The dead key is gone rather than kept as decoration. This is not a
         choice between the three ranking options ISS-058 leaves open — it is
         the same order the code already produced, named correctly. Ranking by
         real order volume, or a curated merchandising order, remains the
         owner's decision. */
      return [{ createdAt: "desc" }];
    // price/discount sorts happen in JS after fetch of the page window —
    // acceptable at current catalog size; moves to SQL with the search engine.
  }
}

type ProductWithRefs = Prisma.ProductGetPayload<{
  include: {
    brand: true;
    category: { select: { slug: true; isBulk: true } };
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

/** Reads the Grade attribute off a product's specs JSON, if present. */
function gradeOf(specs: unknown): string | null {
  if (!Array.isArray(specs)) return null;
  const row = (specs as { label?: string; value?: string }[]).find(
    (sp) => typeof sp?.label === "string" && sp.label.trim().toLowerCase() === "grade"
  );
  return typeof row?.value === "string" && row.value.trim() ? row.value.trim() : null;
}

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
    categoryIsBulk: p.category.isBulk,
    deliverySpeed: p.deliverySpeed ?? null,
    imageUrl: p.images[0]?.url ?? null,
    unitLabel: p.unitLabel,
    variantId: variant.id,
    pricePaise: variant.pricePaise,
    compareAtPaise: variant.compareAtPaise,
    hasBulkTiers: variant.bulkTiers.length > 0,
    gradeLabel: gradeOf(p.specs),
    attributes: attributesOf(p.specs),
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
          category: { select: { slug: true, isBulk: true } },
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

    /* Attribute values live in a JSON column, so there is nothing to filter on
       in SQL. Narrowing here matches how the price and discount sorts already
       work, and the page window is small. Moves into the query when the search
       engine lands. */
    const attrEntries = Object.entries(q.attrs ?? {}).filter(([, v]) => v);
    if (attrEntries.length > 0) {
      items = items.filter((item) =>
        attrEntries.every(([label, value]) => item.attributes[label] === value)
      );
    }

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
        attributes: buildAttributeFacets(items, q.categorySlug),
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

  /* Not a filter. $2 is always a non-empty string, so this is always true — it
   * exists to tell Postgres the parameter's type.
   *
   * Three queries are built from `conditions` and all three are executed with
   * the same `queryArgs`, but $2 (the prefix-match term) is referenced only by
   * the scoring expression in selectSql. Prisma's old query engine tolerated a
   * parameter it never sent; the Prisma 7 driver adapter passes everything
   * through node-postgres, and Postgres refuses a parameter whose type it
   * cannot infer from any use site — `42P18: could not determine data type of
   * parameter $2`. That took out all fourteen search tests on the upgrade.
   *
   * Putting it here rather than in one query is deliberate: the count and facet
   * queries would each need their own copy otherwise, and the next query built
   * from `conditions` would reintroduce the bug. The alternative — renumbering
   * placeholders per query — makes the three SQL strings drift apart. */
  conditions.push("$2::text IS NOT NULL");

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
          category: { select: { isBulk: true } },
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
  const items: CatalogItem[] = [];

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
      categoryIsBulk: p.category.isBulk,
      deliverySpeed: p.deliverySpeed ?? null,
      imageUrl: p.images[0]?.url ?? null,
      unitLabel: p.unitLabel,
      variantId: variant.id,
      pricePaise: variant.pricePaise,
      compareAtPaise: variant.compareAtPaise,
      hasBulkTiers: variant.bulkTiers.length > 0,
    gradeLabel: gradeOf(p.specs),
    attributes: attributesOf(p.specs),
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
      attributes: buildAttributeFacets(items, q.categorySlug),
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
  /** Heavy material — drives the delivery-speed chip. From Category.isBulk. */
  categoryIsBulk: boolean;
  /** Product.deliverySpeed — overrides the category. Null means use the category. */
  deliverySpeed: "express" | "scheduled" | null;
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
    /** Free stock across warehouses. The PDP's structured data states
     *  availability to search engines and had nothing to state it from. */
    inStock: boolean;
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
        include: { bulkTiers: { orderBy: { minQty: "asc" } }, inventory: true },
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
    categoryIsBulk: p.category.isBulk,
    deliverySpeed: p.deliverySpeed ?? null,
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
      inStock:
        (v.inventory?.reduce((sum, i) => sum + (i.qtyOnHand - i.qtyReserved), 0) ?? 0) > 0,
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
    /* Second key was `ratingCount`, which is always zero — see orderBy above.
       Deals first, then newest, which is what it already did. */
    orderBy: [{ isDeal: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      brand: true,
      category: { select: { slug: true, isBulk: true } },
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
      category: { select: { slug: true, isBulk: true } },
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

/**
 * Categories, each carrying how many published products it actually holds.
 *
 * The count is here because the home page advertised one. `components/sections/
 * categories.tsx` shipped a hardcoded figure per tile — "148 products" under
 * Tiling, "134 products" under Sanitary & bath — totalling 879 across twelve
 * categories that hold 30 between them. It is the same claim as the "4,100
 * products" removed from the hero above it, one component further down.
 */
async function listCategoriesRaw() {
  return db.category.findMany({
    where: { isActive: true },
    orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
    include: { _count: { select: { products: { where: { status: "published" } } } } },
  });
}

/** A category plus how many published products it holds. */
export type CategoryWithCount = Awaited<ReturnType<typeof listCategoriesRaw>>[number];

export const listCategories = unstable_cache(
  async () => listCategoriesRaw(),
  ["catalog-categories"],
  { revalidate: 600, tags: ["catalog"] }
);

export async function listCategorySlugs(): Promise<string[]> {
  const rows = await db.category.findMany({ where: { isActive: true }, select: { slug: true } });
  return rows.map((r) => r.slug);
}

/**
 * The products a category has actually sold most of.
 *
 * WHY NOT THE EXISTING "popular" SORT
 *
 * `orderBy` treats `popular` as `ratingCount desc`. There is no Review model and
 * nothing writes that column — every product in the catalogue sits at zero — so
 * the default sort for the entire storefront silently falls through to
 * `createdAt desc`. Products are ordered newest-first by accident rather than by
 * decision, and a section headed "Most ordered" backed by that would be
 * decoration.
 *
 * `OrderItem` is the real signal, and it is the one the artboard actually asks
 * for. Cancelled and unpaid orders are excluded: something abandoned at payment
 * or cancelled at the gate is not evidence anybody wanted it.
 *
 * Returns an empty array while nothing has been ordered, which is the honest
 * answer early on — the caller renders nothing rather than filling the space
 * with whatever happened to be seeded first.
 */
export async function mostOrderedInCategory(
  categorySlug: string,
  limit = 6
): Promise<CatalogItem[]> {
  const rows = await db.orderItem.groupBy({
    by: ["variantId"],
    where: {
      order: {
        status: { notIn: ["pending_payment", "cancelled", "refunded", "refund_initiated"] },
      },
      variant: { product: { category: { slug: categorySlug }, status: "published" } },
    },
    _sum: { qty: true },
    orderBy: { _sum: { qty: "desc" } },
    take: limit,
  });

  if (rows.length === 0) return [];

  const variants = await db.productVariant.findMany({
    where: { id: { in: rows.map((r) => r.variantId) } },
    select: { id: true, productId: true },
  });

  /* Preserve the ranking the aggregate produced — findMany does not. */
  const rank = new Map(rows.map((r, i) => [r.variantId, i]));
  const productIds = [
    ...new Set(
      variants
        .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
        .map((v) => v.productId)
    ),
  ];

  if (productIds.length === 0) return [];

  const rowsFull = await db.product.findMany({
    where: { id: { in: productIds }, status: "published" },
    include: {
      brand: true,
      category: { select: { slug: true, isBulk: true } },
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

  /* findMany does not honour the order of an `in` list, and the whole point of
     this function is the ranking, so it is reapplied here. */
  const order = new Map(productIds.map((id, i) => [id, i]));
  return rowsFull
    .map(toItem)
    .filter((x): x is CatalogItem => x !== null)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/**
 * The brands a category actually stocks, most-stocked first.
 *
 * "Brands we stock" on the subcategory artboard. Trade buyers shop by brand
 * more than by anything else — a contractor who has always used one cement is
 * not browsing, they are looking for it — so this is a shortcut past the grid
 * rather than a decoration.
 *
 * Only brands with a published product in this category, so the strip never
 * offers a filter that returns nothing.
 */
export async function brandsInCategory(categorySlug: string) {
  const rows = await db.brand.findMany({
    where: {
      isActive: true,
      products: { some: { status: "published", category: { slug: categorySlug } } },
    },
    select: {
      slug: true,
      name: true,
      _count: {
        select: { products: { where: { status: "published", category: { slug: categorySlug } } } },
      },
    },
  });

  return rows
    .map((b) => ({ slug: b.slug, name: b.name, count: b._count.products }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Every brand worth offering as a shortcut, for the search screen's entry
 * state — artboard 15b's "Jump to a brand".
 *
 * Only active brands that actually have something published behind them. A
 * brand chip that leads to an empty results page is worse than no chip: the
 * customer reads it as "you stock this" and finds out you do not.
 *
 * Ordered by how much of that brand there is to buy, because the useful
 * shortcut is the one that lands somewhere substantial.
 */
export async function brandsForSearchEntry(
  limit = 12
): Promise<{ slug: string; name: string; count: number }[]> {
  const brands = await db.brand.findMany({
    where: {
      isActive: true,
      products: { some: { status: "published" } },
    },
    select: {
      slug: true,
      name: true,
      _count: { select: { products: { where: { status: "published" } } } },
    },
  });

  return brands
    .map((b) => ({ slug: b.slug, name: b.name, count: b._count.products }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * What to show when a search returns nothing — artboard 15c's "Closest things
 * we do stock".
 *
 * WHAT "CLOSEST" IS ALLOWED TO MEAN
 *
 * Not "popular products". Showing an unrelated best-seller to somebody who
 * searched for a angle grinder is not an answer to their question, and dressing
 * it as one ("closest things we stock") is a small lie that wastes their time.
 *
 * So closeness here is literal: the query is split into words and each is tried
 * on its own. "waterproof cement paint" finds nothing as a phrase but "cement"
 * and "paint" both find real shelves, and those results genuinely relate to
 * what was typed. A query whose every word is a miss returns nothing, and the
 * screen says so rather than filling the space.
 *
 * Words shorter than three characters are dropped — "of", "mm", "20" match
 * everything and would turn a miss into a random assortment.
 */
export async function closestInStock(
  query: string,
  limit = 6
): Promise<{ items: CatalogItem[]; matchedOn: string[] }> {
  const words = [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((w) => w.length >= 3)
    ),
  ].slice(0, 4);

  if (words.length === 0) return { items: [], matchedOn: [] };

  const seen = new Set<string>();
  const items: CatalogItem[] = [];
  const matchedOn: string[] = [];

  for (const word of words) {
    if (items.length >= limit) break;
    const result = await listProducts({ search: word, perPage: limit, sort: "popular" });
    if (result.items.length === 0) continue;
    matchedOn.push(word);
    for (const item of result.items) {
      if (items.length >= limit) break;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }

  return { items, matchedOn };
}

/**
 * What people actually bought alongside this product — the PDP's "Bought with
 * this" rail.
 *
 * NOT THE SAME THING AS `getRelatedProducts`
 *
 * That one returns more of the same category, ordered by `isDeal` and
 * `ratingCount`. The ratings are fabricated (ISS-018), so its ordering is
 * driven by a number nobody measured, and "more cement" is not an answer to
 * "what else do I need for this pour".
 *
 * This is order co-occurrence and nothing else: products that appeared in the
 * same real orders as this one, counted. A trowel next to a bag of cement is
 * useful because somebody buying cement bought a trowel, not because a seed
 * file said they were related.
 *
 * Cancelled and refunded orders are excluded — a basket that came back is not
 * evidence of what goes together.
 *
 * Returns empty until orders exist, and the rail renders nothing when it does.
 * An empty heading is worse than no heading, and filling it with whatever was
 * seeded first is precisely the habit this replaces.
 */
/**
 * Exported only so lib/services/__tests__/bought-with.test.ts can drive it
 * against a real database. `unstable_cache` needs a Next request context and
 * throws outside one, so the wrapped export below is untestable directly — and
 * the logic worth testing (what counts as evidence) is all in here.
 */
export async function boughtWithProductRaw(slug: string, take = 6): Promise<CatalogItem[]> {
  const product = await db.product.findUnique({ where: { slug }, select: { id: true } });
  if (!product) return [];

  /* Orders containing this product, then everything else in them. Two queries
     rather than a join so the counting stays legible; the order set is small
     because it is bounded by one product's sales. */
  const orderIds = (
    await db.orderItem.findMany({
      where: {
        variant: { productId: product.id },
        order: { status: { notIn: ["cancelled", "refunded"] } },
      },
      select: { orderId: true },
      distinct: ["orderId"],
      take: 500,
    })
  ).map((r) => r.orderId);

  if (orderIds.length === 0) return [];

  const companions = await db.orderItem.findMany({
    where: {
      orderId: { in: orderIds },
      variant: { productId: { not: product.id } },
    },
    select: { variant: { select: { productId: true } } },
  });

  const counts = new Map<string, number>();
  for (const c of companions) {
    const id = c.variant.productId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const topIds = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .map(([id]) => id);

  const rows = await db.product.findMany({
    where: { id: { in: topIds }, status: "published" },
    include: {
      brand: true,
      category: { select: { slug: true, isBulk: true } },
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

  /* Restore the co-occurrence order the database query discarded — the whole
     point is that the most-often-bought-with product comes first. */
  return topIds
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map(toItem)
    .filter((x): x is CatalogItem => x !== null);
}

export const boughtWithProduct = unstable_cache(
  async (slug: string, take = 6) => boughtWithProductRaw(slug, take),
  ["catalog-bought-with"],
  { revalidate: 300, tags: ["catalog"] }
);
