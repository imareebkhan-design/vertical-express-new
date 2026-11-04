import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { categoryForPage } from "./data";
import {
  listCategorySlugs,
  listProducts,
  mostOrderedInCategory,
  brandsInCategory,
  listCategoryDirectory,
  visibleProductCount,
} from "@/lib/services/catalog";
import { categoryQueryFromParams } from "@/lib/category-query";
import { CategorySwitcher } from "@/components/mobile/category/category-switcher";
import { comingSoonNextSteps } from "@/lib/category-directory";

export const dynamic = "force-dynamic";

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
  const category = await categoryForPage(slug);
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
      `Browse ${category.name.toLowerCase()} and enquire about pricing, availability and delivery in Srinagar.`,
    alternates: { canonical: `/category/${slug}` },
    /* A coming-soon category is a real page with nothing on it yet; keep it out
       of the index until it has something to find. */
    ...((await visibleProductCount(category.id)) === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const category = await categoryForPage(slug);
  if (!category) notFound();

  /* A designated category with nothing approved yet: "Coming soon", with its
     department's stocked categories as somewhere to go. No product query runs,
     so nothing unapproved can appear (lib/category-directory.ts). */
  if ((await visibleProductCount(category.id)) === 0) {
    const directory = await listCategoryDirectory();
    const entry = directory.flatMap((g) => g.categories).find((c) => c.slug === slug);
    const next = comingSoonNextSteps(directory, slug);
    return (
      <CategorySwitcher
        category={category}
        slug={slug}
        comingSoon={{
          name: entry?.name ?? category.name,
          siblings: next.department,
          elsewhere: next.elsewhere,
        }}
      />
    );
  }

  const queryParams = new URLSearchParams();
  for (const [key, values] of Object.entries(sp)) {
    for (const value of Array.isArray(values) ? values : values === undefined ? [] : [values]) queryParams.append(key, value);
  }
  const query = categoryQueryFromParams(slug, queryParams);
  const brandSlugs = query.brandSlugs ?? [];
  const attrs = query.attrs ?? {};
  const minPrice = queryParams.get("minPrice");
  const maxPrice = queryParams.get("maxPrice");
  const result = await listProducts(query);
  /* The two artboard sections that need their own reads: what this category has
     actually sold, and which brands it stocks. Both return empty naturally —
     "most ordered" before any orders exist, brands for a category with none —
     and the components hide themselves rather than showing a bare heading. */
  const [mostOrdered, brands] = await Promise.all([
    mostOrderedInCategory(slug, 6),
    brandsInCategory(slug),
  ]);

  const activeFilterCount =
    brandSlugs.length + Object.keys(attrs).length + (minPrice ? 1 : 0) + (maxPrice ? 1 : 0);

  return (
    <CategorySwitcher
      category={category}
      slug={slug}
      result={result}
      mostOrdered={mostOrdered}
      brands={brands}
      activeFilterCount={activeFilterCount}
    />
  );
}
