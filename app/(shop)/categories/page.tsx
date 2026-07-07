import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { FloatingCart } from "@/components/floating-cart";
import { CategoryCard } from "@/components/category-card";
import { listCategories } from "@/lib/services/catalog";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "All Categories | Vertical Express",
  description:
    "Browse every construction material category — cement, tiling, electrical, plumbing, hardware and more, delivered in 60 minutes across Srinagar.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  const categories = await listCategories();

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
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
