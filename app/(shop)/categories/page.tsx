import type { Metadata } from "next";
import { listCategories } from "@/lib/services/catalog";
import { CategoriesSwitcher } from "@/components/mobile/categories/categories-switcher";

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
    <CategoriesSwitcher categories={categories} />
  );
}
