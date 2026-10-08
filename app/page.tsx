import type { Metadata } from "next";
import { isPurchasableItem } from "@/lib/catalog-visibility";
import { getCatalogItem, getDeals, listProducts, listCategories, listRooms, mostOrderedRecently } from "@/lib/services/catalog";
import { DEAL_OF_THE_DAY } from "@/lib/merchandising/home";
import { HomeSwitcher } from "@/components/mobile/home/home-switcher";

export const revalidate = 300;

/* The root layout already sets the full metadata for this URL — title,
 * description, canonical, Open Graph, Twitter and robots. Duplicating it here
 * only creates two places to keep in sync, and they had already drifted. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  const [deals, popular, newestResult, categories, rooms, dealProduct] = await Promise.all([
    getDeals(8),
    /* Real order volume from the last 7 days, not the catalogue's "popular"
       sort — that sort orders by `ratingCount` (see catalog.ts), a column
       nothing writes, so it silently fell back to newest-first. A section
       headed "Popular in Srinagar this week" was therefore never actually
       popular; it was decoration. `mostOrderedRecently` is the same evidence
       source the native app already uses, and it returns nothing rather than
       a guess when there is no real order history yet — the section below is
       already conditioned on that. */
    mostOrderedRecently(7, 12),
    listProducts({ sort: "newest", perPage: 8 }),
    listCategories(),
    /* Real curated rooms, or []. "Shop by room" previously rendered four
       hardcoded tiles regardless — three of the four (Bathroom, Living room,
       Bedroom) linked to a text search that returns zero products every
       single time against the seeded catalogue, a guaranteed-fail CTA
       disguised as a working feature. Passed through as data now, so the
       component can do what the mobile app already correctly does with the
       same empty table: render nothing until a room is actually curated. */
    listRooms(),
    /* The Deal of the Day reads its product's real price from the catalogue;
       with no deal configured there is nothing to fetch. */
    DEAL_OF_THE_DAY ? getCatalogItem(DEAL_OF_THE_DAY.productSlug) : Promise.resolve(null),
  ]);

  /* The category tiles advertise how much is in each one. They used to carry
     the figure as a literal; it comes from the same query as the categories. */
  const categoryCounts = Object.fromEntries(
    categories.map((c) => [c.slug, c._count.products])
  );

  return (
    <HomeSwitcher
      deals={deals}
      featured={popular}
      newArrivals={newestResult.items}
      categories={categories}
      categoryCounts={categoryCounts}
      rooms={rooms}
      dealProduct={dealProduct && isPurchasableItem(dealProduct) ? dealProduct : null}
    />
  );
}
