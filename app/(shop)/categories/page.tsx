import type { Metadata } from "next";
import { listCategories } from "@/lib/services/catalog";
import { CategoriesSwitcher } from "@/components/mobile/categories/categories-switcher";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All Categories",
  description:
    "Browse every construction material category — cement, tiling, electrical, plumbing, hardware and more, delivered across Srinagar.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  const categories = await listCategories();

  return (
    <CategoriesSwitcher categories={categories} />
  );
}
