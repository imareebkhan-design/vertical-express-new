"use client";

import React, { useEffect, useState } from "react";
import type { Category } from "@/prisma/generated/client";
import { useNativeShell } from "@/components/mobile/native-shell-provider";

// Web Components
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { FloatingCart } from "@/components/floating-cart";
import { CategoryCard } from "@/components/category-card";
import { PageLoader } from "@/components/page-loader";

// Mobile Components
import { MobileCategoriesView } from "@/components/mobile/categories/mobile-categories-view";

interface CategoriesSwitcherProps {
  categories: Category[];
}

export function CategoriesSwitcher({ categories }: CategoriesSwitcherProps) {
  const { isNative } = useNativeShell();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <PageLoader />;
  }

  if (isNative) {
    return <MobileCategoriesView categories={categories} />;
  }

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">All Categories</h1>
        <p className="mt-1 text-sm font-semibold text-neutral-500">
          Everything your site needs, one hour away
        </p>

        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-5 md:grid-cols-4 lg:grid-cols-6">
          {categories.map((c) => (
            <CategoryCard
              key={c.slug}
              category={{ name: c.name, slug: c.slug, href: `/category/${c.slug}`, bulk: c.isBulk }}
            />
          ))}
        </div>
      </main>
      <Footer />
      <FloatingCart />
    </>
  );
}
