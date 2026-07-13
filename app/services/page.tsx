import type { Metadata } from "next";
import { AnnouncementBar } from "@/components/sections/announcement-bar";
import { Navbar } from "@/components/sections/navbar";
import { ServicesHero } from "@/components/sections/services/services-hero";
import { WhyChoose } from "@/components/sections/services/why-choose";
import { ServiceCategoriesSection } from "@/components/sections/services/service-categories";
import { HowItWorks } from "@/components/sections/services/how-it-works";
import { FeaturedServices } from "@/components/sections/services/featured-services";
import { TrustStats } from "@/components/sections/services/trust-stats";
import { ServicesCTA } from "@/components/sections/services/services-cta";
import { Footer } from "@/components/sections/footer";
import { FloatingCart } from "@/components/floating-cart";

export const metadata: Metadata = {
  title: "Construction & Home Services Srinagar | Vertical Express",
  description:
    "Hire verified professionals and skilled labor for home construction, renovation, interiors, painting, plumbing, electrical work and more — with materials and labor on one platform.",
  openGraph: {
    title: "Vertical Express Services — Build your dream home without the hassle",
    description:
      "Verified professionals, transparent pricing, and quality materials — all in one place.",
    type: "website",
  },
};

export default function ServicesPage() {
  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main id="main-content">
        <ServicesHero />
        <WhyChoose />
        <ServiceCategoriesSection />
        <HowItWorks />
        <FeaturedServices />
        <TrustStats />
        <ServicesCTA />
      </main>
      <Footer />
      <FloatingCart />
    </>
  );
}
