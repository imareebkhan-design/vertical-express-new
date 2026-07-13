import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { CartView } from "@/components/shop/cart-view";

export const metadata: Metadata = {
  title: "Your Cart | Vertical Express",
  robots: { index: false },
};

export default function CartPage() {
  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-extrabold tracking-tight sm:text-3xl">Your Cart</h1>
        <CartView />
      </main>
      <Footer />
    </>
  );
}
