import type { Metadata } from "next";
import { getDeals, listProducts, listCategories } from "@/lib/services/catalog";
import { HomeSwitcher } from "@/components/mobile/home/home-switcher";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Cement, Ply, Hardware & Painting in Srinagar | Vertical Express",
  description:
    "Vertical Express delivers construction materials, hardware and home-improvement supplies across Srinagar. Cement, tiling, plywood, wires, paint and more — genuine brands at trade prices.",
  keywords: [
    "construction materials",
    "cement delivery",
    "hardware store Srinagar",
  ],
  openGraph: {
    title: "Vertical Express — Building material, on site today",
    description:
      "Cement, ply, hardware and painting supplies delivered across Srinagar.",
    type: "website",
  },
  icons: {
    icon: "/logo-icon.png",
  },
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
