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
import {
  getCategoryBySlug,
  listCategorySlugs,
  listProducts,
  type CatalogSort,
} from "@/lib/services/catalog";

export const revalidate = 300;

export async function generateStaticParams() {
  const slugs = await listCategorySlugs();
  return slugs.map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; page?: string }>;
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

  const result = await listProducts({
    categorySlug: slug,
    sort: (sp.sort as CatalogSort) ?? "popular",
    page: sp.page ? parseInt(sp.page, 10) || 1 : 1,
  });

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

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{category.name}</h1>
            <p className="mt-1 text-sm font-semibold text-neutral-500">
              {result.total} {result.total === 1 ? "product" : "products"}
              {category.isBulk && " · Bulk prices available"}
            </p>
          </div>
          <SortSelect />
        </div>

        {result.items.length === 0 ? (
          <EmptyState
            title="No products here yet"
            caption="We're stocking this category. Check back soon or browse everything else."
          />
        ) : (
          <>
            <CatalogGrid items={result.items} />
            <Pagination page={result.page} perPage={result.perPage} total={result.total} />
          </>
        )}
      </main>
      <Footer />
      <FloatingCart />
    </>
  );
}
