"use client";

import React from "react";
import type { ProductDetail, CatalogItem } from "@/lib/services/catalog";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";

// Web Components
import { Navbar } from "@/components/sections/navbar";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
import { Footer } from "@/components/sections/footer";
import { ProductGallery } from "@/components/shop/product-gallery";
import { PdpActions } from "@/components/shop/pdp-actions";
import { PdpPromises } from "@/components/shop/pdp-promises";
import { speedClassFor } from "@/components/ui/speed-chip";
import { PincodeCheck } from "@/components/shop/pincode-check";
import { CatalogGrid } from "@/components/shop/catalog-grid";
import { RecentlyViewedTracker, RecentlyViewedSection } from "@/components/shop/recently-viewed";
import { PageLoader } from "@/components/page-loader";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { paiseToRupees } from "@/lib/money";

// Mobile Components
import { MobileProductView } from "@/components/mobile/product/mobile-product-view";

interface ProductSwitcherProps {
  product: ProductDetail;
  related: CatalogItem[];
  /** Order co-occurrence, not category. Empty until orders exist. */
  boughtWith: CatalogItem[];
}

export function ProductSwitcher({ product, related, boughtWith }: ProductSwitcherProps) {
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);

  if (!ready) {
    return <PageLoader />;
  }

  if (isMobile) {
    return <MobileProductView product={product} related={related} boughtWith={boughtWith} />;
  }

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
    /* `availability` was the string "https://schema.org/InStock", hardcoded, on
       every product. Structured data is a claim to a search engine that shows
       up beside the result as "In stock", and this one was independent of the
       inventory table — it stayed InStock through a sell-out. The PDP had no
       stock data to state it from, because getProductBySlug never fetched the
       inventory rows; it does now, so the claim follows the stock.

       An offer with no default variant states no price and no availability
       rather than ₹0 and in stock. */
    offers: defaultVariant
      ? {
          "@type": "Offer",
          priceCurrency: "INR",
          price: paiseToRupees(defaultVariant.pricePaise),
          availability: defaultVariant.inStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        }
      : undefined,
  };

  /* Up to four attributes, in the order the record lists them, joined the way
     the design sets a spec line. */
  const specLine = [
    ...product.specs.slice(0, 4).map((sp) => sp.value),
    product.unitLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 sm:pb-12">
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
          <ProductGallery
            images={product.images}
            title={product.title}
            categorySlug={product.categorySlug}
          />

          <div>
            {/* Brand is a plain uppercase eyebrow — never a mark, never amber. */}
            <Link
              href={`/category/${product.categorySlug}`}
              className="text-[9.5px] font-bold uppercase leading-3 tracking-[0.09em] text-ink-500 no-underline hover:text-ink"
            >
              {product.brandName}
            </Link>
            <h1 className="mt-1.5 text-[28px] font-extrabold leading-[34px] tracking-[-0.025em] sm:text-[31px] sm:leading-9">
              {product.title}
            </h1>

            {/* Spec line: the grade and pack a buyer compares on, from the
                product's own attributes. Nothing is composed that the record
                does not already carry. */}
            {specLine && (
              <p className="mt-2 text-[13px] font-medium leading-[18.5px] text-ink-700">
                {specLine}
              </p>
            )}

            <div className="mt-6">
              <PdpActions product={product} />
            </div>

            <PdpPromises
          speed={speedClassFor(product.categoryIsBulk, product.deliverySpeed)}
          categorySlug={product.categorySlug}
        />

            <div className="mt-6">
              <PincodeCheck defaultPincode="190001" />
            </div>

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

        {/* Bought with this comes first: what somebody else needed alongside
            this is a better answer than more of the same shelf. */}
        {boughtWith.length > 0 && (
          <section aria-label="Bought with this" className="mt-16">
            <h2 className="mb-6 text-xl font-extrabold tracking-tight sm:text-2xl">
              Bought with this
            </h2>
            <CatalogGrid items={boughtWith} />
          </section>
        )}

        {related.length > 0 && (
          <section aria-label="Related products" className="mt-16">
            <h2 className="mb-6 text-xl font-extrabold tracking-tight sm:text-2xl">
              More in {product.categoryName}
            </h2>
            <CatalogGrid items={related} />
          </section>
        )}

        <RecentlyViewedSection currentSlug={product.slug} />
        {/* Same `?? 0` as the structured data had, on a surface that persists:
            the recently-viewed strip stores its item in localStorage and renders
            formatPaise(pricePaise), so a product with no active variant followed
            the customer around the site priced at ₹0. A product we cannot price
            is not recorded rather than recorded at zero. */}
        {defaultVariant && (
          <RecentlyViewedTracker
            item={{
              slug: product.slug,
              title: product.title,
              imageUrl: product.images[0]?.url ?? null,
              pricePaise: defaultVariant.pricePaise,
              brandName: product.brandName,
            }}
          />
        )}
        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}
