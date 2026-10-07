"use client";

import React from "react";
import type { CatalogItem, listRooms } from "@/lib/services/catalog";
import type { Category } from "@/prisma/generated/client/client";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";

import { Navbar } from "@/components/sections/navbar";
import { Hero } from "@/components/sections/hero";
import { Categories, type CategoryCounts } from "@/components/sections/categories";
import { Deals } from "@/components/sections/deals";
import { OrderedMost } from "@/components/sections/ordered-most";
import { ServicesBanner } from "@/components/sections/services-banner";
import { Footer } from "@/components/sections/footer";
import { PageLoader } from "@/components/page-loader";
import { TrendingSrinagar } from "@/components/merchandising/trending-srinagar";
import { DealOfTheDay } from "@/components/merchandising/deal-of-the-day";
import type { DealProduct } from "@/lib/merchandising/deal";

// Mobile Native components
import { MobileHomeView } from "@/components/mobile/home/mobile-home-view";

interface HomeSwitcherProps {
  deals: CatalogItem[];
  featured: CatalogItem[];
  newArrivals: CatalogItem[];
  categories: Category[];
  /** Published products per category slug. The tiles used to hardcode these. */
  categoryCounts: CategoryCounts;
  /** Curated rooms, or []. See `ShopByRoom` for why an empty array hides the section rather than rendering placeholder tiles. */
  rooms: Awaited<ReturnType<typeof listRooms>>;
  /** The configured Deal of the Day's product, or null (see `lib/merchandising/home.ts`). */
  dealProduct: DealProduct | null;
}

export function HomeSwitcher({ deals, featured, newArrivals, categories, categoryCounts, rooms, dealProduct }: HomeSwitcherProps) {
  /* Only categories the catalogue has open may be linked from merchandising. */
  const categoryNames = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);

  if (!ready) {
    return <PageLoader />;
  }

  if (isMobile) {
    return (
      <MobileHomeView
        deals={deals}
        featured={featured}
        newArrivals={newArrivals}
        categories={categories}
        rooms={rooms}
        categoryNames={categoryNames}
        dealProduct={dealProduct}
      />
    );
  }

  return (
    <>
      <Navbar />
      <main id="main-content">
        <Hero />
        <Categories counts={categoryCounts} />
        <TrendingSrinagar categoryNames={categoryNames} />
        <DealOfTheDay product={dealProduct} />
        <Deals items={deals} />
        <OrderedMost items={featured} />
        <ServicesBanner />
      </main>
      <Footer />
    </>
  );
}

