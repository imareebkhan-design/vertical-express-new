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
import { attributeConfigFor } from "@/lib/catalog-attributes";

export const revalidate = 300;

export async function generateStaticParams() {
  const slugs = await listCategorySlugs();
  return slugs.map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
  /* Attribute filters arrive as lowercased labels — ?type=Vitrified&finish=Matt
     — so the bag is open-ended rather than a fixed set of keys. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const brandSlugs = Array.isArray(sp.brand) ? sp.brand : sp.brand ? [sp.brand] : [];

  /* Only the attributes this category is configured to browse by are honoured,
     so a hand-edited query string cannot filter on an arbitrary field. */
  const attrs: Record<string, string> = {};
  for (const label of attributeConfigFor(slug).attributes) {
    const value = one(sp[label.toLowerCase()]);
    if (value) attrs[label] = value;
  }

  const minPrice = one(sp.minPrice);
  const maxPrice = one(sp.maxPrice);
  const result = await listProducts({
    categorySlug: slug,
    brandSlugs,
    attrs,
    minPaise: minPrice ? rupeesToPaise(Number(minPrice)) : undefined,
    maxPaise: maxPrice ? rupeesToPaise(Number(maxPrice)) : undefined,
    sort: (one(sp.sort) as CatalogSort) ?? "popular",
    page: one(sp.page) ? parseInt(one(sp.page)!, 10) || 1 : 1,
  });
  const activeFilterCount =
    brandSlugs.length + Object.keys(attrs).length + (minPrice ? 1 : 0) + (maxPrice ? 1 : 0);

  return (
    <CategorySwitcher
      category={category}
      slug={slug}
      result={result}
      activeFilterCount={activeFilterCount}
    />
  );
}
