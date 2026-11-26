import type { Metadata } from "next";
import { listCategoryDirectory } from "@/lib/services/catalog";
import { CategoriesSwitcher } from "@/components/mobile/categories/categories-switcher";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All Categories",
  description:
    "Browse every construction material category — cement, tiling, electrical, plumbing, hardware and more, delivered across Srinagar.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  /* The department directory (lib/category-directory.ts): designated material
     categories appear even before a product is approved, as "Coming soon". */
  const directory = await listCategoryDirectory();
  return <CategoriesSwitcher directory={directory} />;
}
