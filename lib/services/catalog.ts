import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

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
      include: { bulkTiers: { select: { id: true }; take: 1 } };
    };
  };
}>;

function toItem(p: ProductWithRefs): CatalogItem | null {
  const variant = p.variants[0];
  if (!variant) return null;
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
  };
}

export async function listProducts(q: CatalogQuery): Promise<CatalogResult> {
  const page = Math.max(1, q.page ?? 1);
  const perPage = Math.min(PER_PAGE_MAX, Math.max(1, q.perPage ?? PER_PAGE_DEFAULT));
  const where = buildWhere(q);

  const priceSort = q.sort === "price_asc" || q.sort === "price_desc" || q.sort === "discount";

  const [rows, total, brandGroups, priceAgg] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: orderBy(q.sort),
      // price-sorted views fetch the full filtered set (small catalog) then sort
      ...(priceSort ? {} : { skip: (page - 1) * perPage, take: perPage }),
      include: {
        brand: true,
        category: { select: { slug: true } },
        images: { where: { isPrimary: true }, take: 1 },
        variants: {
          where: { isDefault: true },
          include: { bulkTiers: { select: { id: true }, take: 1 } },
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
export async function getRelatedProducts(
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
        include: { bulkTiers: { select: { id: true }, take: 1 } },
      },
    },
  });
  return rows.map(toItem).filter((x): x is CatalogItem => x !== null);
}

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

export async function listCategories() {
  return db.category.findMany({
    where: { isActive: true },
    orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
  });
}

export async function listCategorySlugs(): Promise<string[]> {
  const rows = await db.category.findMany({ where: { isActive: true }, select: { slug: true } });
  return rows.map((r) => r.slug);
}
