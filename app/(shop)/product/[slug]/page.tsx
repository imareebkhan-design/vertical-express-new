import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getProductBySlug,
  getRelatedProducts,
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
    title: `${product.title} | Vertical Express`,
    description:
      product.description ??
      `Buy ${product.title} from ${product.brandName} with 60-minute delivery across Srinagar.`,
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

  const related = await getRelatedProducts(product.categorySlug, product.slug);

  return (
    <ProductSwitcher
      product={product}
      related={related}
    />
  );
}
