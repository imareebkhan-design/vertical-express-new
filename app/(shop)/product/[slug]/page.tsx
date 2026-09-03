import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getProductBySlug,
  getRelatedProducts,
  boughtWithProduct,
  listProductSlugs,
} from "@/lib/services/catalog";
import { ProductSwitcher } from "@/components/mobile/product/product-switcher";

export const revalidate = 300;

export async function generateStaticParams() {
  const slugs = await listProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  return {
    /* The layout's title template appends "| Vertical Express" already, so
       adding it here rendered every product page as "…| Vertical Express |
       Vertical Express" — the doubling fixed in 5d36431 across the static
       titles, surviving here because this one is built at request time.
       /category/[slug] does the same thing correctly, with `absolute`, which
       bypasses the template instead of feeding it. */
    title: product.title,
    description:
      product.description ??
      `Buy ${product.title} from ${product.brandName} delivered across Srinagar.`,
    alternates: { canonical: `/product/${slug}` },
    openGraph: {
      title: product.title,
      images: product.images[0]?.url ? [product.images[0].url] : undefined,
      type: "website",
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  /* Two different rails and they are not interchangeable. `related` is more of
     the same category, ordered by isDeal and ratingCount — and the ratings are
     fabricated (ISS-018), so it is a shelf, not a recommendation.
     `boughtWith` is order co-occurrence: what people actually put in the same
     basket. It is empty until there are orders, and renders nothing when it
     is. */
  const [related, boughtWith] = await Promise.all([
    getRelatedProducts(product.categorySlug, product.slug),
    boughtWithProduct(product.slug),
  ]);

  return (
    <ProductSwitcher
      product={product}
      related={related}
      boughtWith={boughtWith}
    />
  );
}
