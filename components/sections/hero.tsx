"use client";

import { HeroBanners } from "@/components/merchandising/hero-banners";
import { HERO_BANNERS } from "@/lib/merchandising/home";
import { withShownCategoryLinks } from "@/lib/category-nav";
import { useCategoryNav } from "@/components/shop/category-nav-provider";

/**
 * The top of the home page: the banner carousel and nothing else. Delivery
 * location lives in the header (the location sheet), so it is not repeated here.
 * The page's one h1 sits outside the carousel so it does not rotate away.
 */
export function Hero() {
  /* No banner for a category the shop does not show (ISS-102). */
  const { slugs } = useCategoryNav();
  return (
    <section className="pt-6">
      <h1 className="sr-only">Building material, on site today — Vertical Express, Srinagar</h1>
      <div className="mx-auto max-w-[1200px] px-6">
        <HeroBanners banners={withShownCategoryLinks(HERO_BANNERS, slugs)} />
      </div>
    </section>
  );
}
