import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { FloatingCart } from "@/components/floating-cart";
import { CatalogGrid } from "@/components/shop/catalog-grid";
import { EmptyState } from "@/components/shop/empty-state";
import { getAuthUserId } from "@/lib/supabase/server";
import { getWishlistItems } from "@/lib/services/wishlist";

export const metadata: Metadata = {
  title: "My Wishlist | Vertical Express",
  robots: { index: false },
};

export default async function WishlistPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login?next=/account/wishlist");

  const items = await getWishlistItems(userId);
  const wishlistedIds = new Set(items.map((i) => i.id));

  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight sm:text-3xl">My Wishlist</h1>
        {items.length === 0 ? (
          <EmptyState
            title="No saved items yet"
            caption="Tap the heart on any product to save it here for later."
          />
        ) : (
          <CatalogGrid items={items} wishlistedIds={wishlistedIds} />
        )}
      </main>
      <Footer />
      <FloatingCart />
    </>
  );
}
