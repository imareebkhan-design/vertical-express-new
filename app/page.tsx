import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { Hero } from "@/components/sections/hero";
import { Deals } from "@/components/sections/deals";
import { getDeals } from "@/lib/services/catalog";
import { Categories } from "@/components/sections/categories";
import { AppBanner } from "@/components/sections/app-banner";
import { Testimonials } from "@/components/sections/testimonials";
import { TrustBadges } from "@/components/sections/trust-badges";
import { ServicesPromo } from "@/components/sections/services-promo";
import { Footer } from "@/components/sections/footer";
import { FloatingCart } from "@/components/floating-cart";
import { WelcomePopup } from "@/components/welcome-popup";
import { PageLoader } from "@/components/page-loader";

export const revalidate = 300;

export default async function Home() {
  const deals = await getDeals();
  return (
    <>
      <PageLoader />
      <AnnouncementBar />
      <Navbar />
      <main id="main-content">
        <Hero />
        <Deals items={deals} />
        <Categories />
        <AppBanner />
        <Testimonials />
        <TrustBadges />
        <ServicesPromo />
      </main>
      <Footer />
      <FloatingCart />
      <WelcomePopup />
    </>
  );
}
