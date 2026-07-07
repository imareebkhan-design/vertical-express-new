import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { FloatingCart } from "@/components/floating-cart";
import { CatalogGrid } from "@/components/shop/catalog-grid";
import { SortSelect } from "@/components/shop/sort-select";
import { Pagination } from "@/components/shop/pagination";
import { EmptyState } from "@/components/shop/empty-state";
import { FilterSidebar } from "@/components/shop/filter-sidebar";
import { FilterSheet } from "@/components/shop/filter-sheet";
import {
  getCategoryBySlug,
  listCategorySlugs,
  listProducts,
  type CatalogSort,
} from "@/lib/services/catalog";
import { rupeesToPaise } from "@/lib/money";

export const revalidate = 300;

export async function generateStaticParams() {
  const slugs = await listCategorySlugs();
  return slugs.map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    sort?: string;
    page?: string;
    brand?: string | string[];
    minPrice?: string;
    maxPrice?: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };
  return {
    title: category.seoTitle ?? `${category.name} | Vertical Express`,
    description:
      category.seoDescription ??
      `Buy ${category.name.toLowerCase()} at trade prices with 60-minute delivery across Srinagar.`,
    alternates: { canonical: `/category/${slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const brandSlugs = Array.isArray(sp.brand) ? sp.brand : sp.brand ? [sp.brand] : [];
  const result = await listProducts({
    categorySlug: slug,
    brandSlugs,
    minPaise: sp.minPrice ? rupeesToPaise(Number(sp.minPrice)) : undefined,
    maxPaise: sp.maxPrice ? rupeesToPaise(Number(sp.maxPrice)) : undefined,
    sort: (sp.sort as CatalogSort) ?? "popular",
    page: sp.page ? parseInt(sp.page, 10) || 1 : 1,
  });
  const activeFilterCount = brandSlugs.length + (sp.minPrice ? 1 : 0) + (sp.maxPrice ? 1 : 0);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Categories", item: "/categories" },
      { "@type": "ListItem", position: 3, name: category.name },
    ],
  };

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />

        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs font-bold text-neutral-500">
          <Link href="/" className="hover:text-ink">Home</Link>
          <ChevronRight className="size-3" aria-hidden />
          <Link href="/categories" className="hover:text-ink">Categories</Link>
          <ChevronRight className="size-3" aria-hidden />
          <span className="text-ink">{category.name}</span>
        </nav>

        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{category.name}</h1>
          <p className="mt-1 text-sm font-semibold text-neutral-500">
            {result.total} {result.total === 1 ? "product" : "products"}
            {category.isBulk && " · Bulk prices available"}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <div className="hidden lg:block">
            <FilterSidebar facets={result.facets} />
          </div>

          <div>
            <div className="mb-5 flex items-center justify-between gap-3">
              <FilterSheet facets={result.facets} activeCount={activeFilterCount} />
              <SortSelect />
            </div>

            {result.items.length === 0 ? (
              <EmptyState
                title="No products match these filters"
                caption="Try removing a filter or browse everything in this category."
              />
            ) : (
              <>
                <CatalogGrid items={result.items} />
                <Pagination page={result.page} perPage={result.perPage} total={result.total} />
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
      <FloatingCart />
    </>
  );
}
