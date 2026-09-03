"use client";

import React from "react";
import type { CatalogItem } from "@/lib/services/catalog";
import type { Category } from "@/prisma/generated/client/client";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";

import { Navbar } from "@/components/sections/navbar";
import { Hero } from "@/components/sections/hero";
import { Categories, type CategoryCounts } from "@/components/sections/categories";
import { Deals } from "@/components/sections/deals";
import { HowWeWork } from "@/components/sections/how-we-work";
import { OrderedMost } from "@/components/sections/ordered-most";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
import { Footer } from "@/components/sections/footer";
import { PageLoader } from "@/components/page-loader";

// Mobile Native components
import { MobileHomeView } from "@/components/mobile/home/mobile-home-view";

interface HomeSwitcherProps {
  deals: CatalogItem[];
  featured: CatalogItem[];
  newArrivals: CatalogItem[];
  categories: Category[];
  /** Published products per category slug. The tiles used to hardcode these. */
  categoryCounts: CategoryCounts;
}

export function HomeSwitcher({ deals, featured, newArrivals, categories, categoryCounts }: HomeSwitcherProps) {
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
      />
    );
  }

  return (
    <>
      <Navbar />
      <main id="main-content">
        <Hero />
        <Categories counts={categoryCounts} />
        <Deals items={deals} />
        <HowWeWork />
        <OrderedMost items={featured} />
        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
    </>
  );
}

