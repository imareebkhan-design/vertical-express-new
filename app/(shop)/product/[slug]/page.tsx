import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ShieldCheck, Truck, Wallet } from "lucide-react";
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { FloatingCart } from "@/components/floating-cart";
import { ProductGallery } from "@/components/shop/product-gallery";
import { PdpActions } from "@/components/shop/pdp-actions";
import { PincodeCheck } from "@/components/shop/pincode-check";
import { CatalogGrid } from "@/components/shop/catalog-grid";
import {
  getProductBySlug,
  getRelatedProducts,
  listProductSlugs,
} from "@/lib/services/catalog";
import { paiseToRupees } from "@/lib/money";

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
  const defaultVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0];

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description ?? undefined,
    brand: { "@type": "Brand", name: product.brandName },
    image: product.images.map((i) => i.url),
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.ratingAvg,
            reviewCount: product.ratingCount,
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: paiseToRupees(defaultVariant?.pricePaise ?? 0),
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 sm:pb-12">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />

        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1 text-xs font-bold text-neutral-500">
          <Link href="/" className="hover:text-ink">Home</Link>
          <ChevronRight className="size-3" aria-hidden />
          <Link href={`/category/${product.categorySlug}`} className="hover:text-ink">
            {product.categoryName}
          </Link>
          <ChevronRight className="size-3" aria-hidden />
          <span className="text-ink">{product.title}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <ProductGallery images={product.images} title={product.title} />

          <div>
            <Link
              href={`/category/${product.categorySlug}`}
              className="text-xs font-extrabold uppercase tracking-widest text-brand-deep hover:underline"
            >
              {product.brandName}
            </Link>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
              {product.title}
            </h1>

            <div className="mt-6">
              <PdpActions product={product} />
            </div>

            <div className="mt-6">
              <PincodeCheck defaultPincode="190001" />
            </div>

            {/* Trust row */}
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                { icon: Truck, label: "60-min delivery" },
                { icon: Wallet, label: "Pay on delivery" },
                { icon: ShieldCheck, label: "Genuine brands" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="rounded-card bg-surface/60 p-3">
                  <Icon className="mx-auto size-5 text-brand-deep" strokeWidth={1.8} aria-hidden />
                  <p className="mt-1 text-[11px] font-bold text-neutral-600">{label}</p>
                </div>
              ))}
            </div>

            {/* Description */}
            {product.description && (
              <div className="mt-8">
                <h2 className="text-sm font-extrabold uppercase tracking-widest text-neutral-500">
                  Description
                </h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-neutral-600">
                  {product.description}
                </p>
              </div>
            )}

            {/* Specs */}
            {product.specs.length > 0 && (
              <div className="mt-8">
                <h2 className="text-sm font-extrabold uppercase tracking-widest text-neutral-500">
                  Specifications
                </h2>
                <dl className="mt-3 divide-y divide-neutral-100 rounded-card border border-neutral-100">
                  {product.specs.map((s) => (
                    <div key={s.label} className="flex justify-between gap-4 px-4 py-2.5">
                      <dt className="text-sm font-bold text-neutral-500">{s.label}</dt>
                      <dd className="text-sm font-extrabold text-ink">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <section aria-label="Related products" className="mt-16">
            <h2 className="mb-6 text-xl font-extrabold tracking-tight sm:text-2xl">
              More in {product.categoryName}
            </h2>
            <CatalogGrid items={related} />
          </section>
        )}
      </main>
      <Footer />
      <FloatingCart />
    </>
  );
}
