import type { Metadata } from "next";
import { getDeals, listProducts, listCategories } from "@/lib/services/catalog";
import { HomeSwitcher } from "@/components/mobile/home/home-switcher";

export const revalidate = 300;

/* The root layout already sets the full metadata for this URL — title,
 * description, canonical, Open Graph, Twitter and robots. Duplicating it here
 * only creates two places to keep in sync, and they had already drifted. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  const [deals, popularResult, newestResult, categories] = await Promise.all([
    getDeals(8),
    listProducts({ sort: "popular", perPage: 12 }),
    listProducts({ sort: "newest", perPage: 8 }),
    listCategories(),
  ]);

  return (
    <HomeSwitcher
      deals={deals}
      featured={popularResult.items}
      newArrivals={newestResult.items}
      categories={categories}
    />
  );
}
