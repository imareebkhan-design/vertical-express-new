"use client";

import React, { useEffect, useState } from "react";
import type { CatalogItem } from "@/lib/services/catalog";
import type { Category } from "@prisma/client";
import { useNativeShell } from "@/components/mobile/native-shell-provider";

// Desktop Web components
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Hero } from "@/components/sections/hero";
import { Deals } from "@/components/sections/deals";
import { Categories } from "@/components/sections/categories";
import { HowWeWork } from "@/components/sections/how-we-work";
import { ServicesBanner } from "@/components/sections/services-banner";
import { DownloadsStrip } from "@/components/sections/downloads-strip";
import { Footer } from "@/components/sections/footer";
import { FloatingCart } from "@/components/floating-cart";
import { WelcomePopup } from "@/components/welcome-popup";
import { PageLoader } from "@/components/page-loader";
import { SearchBox } from "@/components/shop/search-box";

// Mobile Native components
import { MobileHomeView } from "@/components/mobile/home/mobile-home-view";

interface HomeSwitcherProps {
  deals: CatalogItem[];
  featured: CatalogItem[];
  newArrivals: CatalogItem[];
  categories: Category[];
}

export function HomeSwitcher({ deals, featured, newArrivals, categories }: HomeSwitcherProps) {
  const { isNative } = useNativeShell();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Initial hydration skeleton or simple loader
    return <PageLoader />;
  }

  if (isNative) {
    return (
      <MobileHomeView
        deals={deals}
        featured={featured}
        newArrivals={newArrivals}
        categories={categories}
      />
    );
  }

  // Regular Web layout
  return (
    <>
      <PageLoader />
      <AnnouncementBar />
      <Navbar />
      <main id="main-content">
        <div className="px-4 py-3 md:hidden">
          <SearchBox />
        </div>
        <Hero />
        <Deals items={deals} />
        <Categories />
        <HowWeWork />
        <ServicesBanner />
        <DownloadsStrip />
      </main>
      <Footer />
      <FloatingCart />
      <WelcomePopup />
    </>
  );
}
