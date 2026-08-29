import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCategoryBySlug,
  listCategorySlugs,
  listProducts,
  type CatalogSort,
} from "@/lib/services/catalog";
import { rupeesToPaise } from "@/lib/money";
import { CategorySwitcher } from "@/components/mobile/category/category-switcher";

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
    // `absolute` bypasses the root layout's "%s | Vertical Express" template:
    // seoTitle is already a complete, length-checked title (see
    // scripts/category-seo.mjs), and letting the template append the brand a
    // second time produced "Cement in Srinagar | Vertical Express | Vertical
    // Express" and pushed long names back over Google's ~60 char limit.
    title: { absolute: category.seoTitle ?? `${category.name} | Vertical Express` },
    description:
      category.seoDescription ??
      `Buy ${category.name.toLowerCase()} at trade prices delivered across Srinagar.`,
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

  return (
    <CategorySwitcher
      category={category}
      slug={slug}
      result={result}
      activeFilterCount={activeFilterCount}
    />
  );
}
