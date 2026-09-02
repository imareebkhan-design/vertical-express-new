import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SmoothScrollProvider } from "@/hooks/use-lenis";
import { CartProvider } from "@/hooks/use-cart";
import { NativeShellProvider } from "@/components/mobile/native-shell-provider";

// One geometric sans throughout. Headlines mix weights inside a single line:
// a 300-weight grey lead-in, then 800-weight ink.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

import { SiteJsonLd } from "@/components/seo/site-jsonld";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.verticalexpress.in"),
  // Title 55 chars and description 144: both inside what Google renders
  // (~60 / ~158) rather than being cut mid-phrase, as the previous 63/186 were.
  // The categories are ordered by search intent — cement first — and no
  // delivery time is claimed anywhere, because none is confirmed. "Every
  // product shows its own delivery speed" is the same promise the storefront
  // makes, and one the per-product speed chip actually keeps.
  title: {
    default: "Cement, Hardware & Paint in Srinagar | Vertical Express",
    template: "%s | Vertical Express",
  },
  description:
    "Cement, plywood, wires, paint, sanitaryware and hardware delivered across Srinagar. Every product shows its own delivery speed before you order.",
  applicationName: "Vertical Express",
  keywords: [
    "building material Srinagar",
    "cement Srinagar",
    "hardware store Srinagar",
    "plywood Srinagar",
    "construction materials Kashmir",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Vertical Express — Building material, on site today",
    description:
      "Construction materials for contractors and homeowners in Srinagar. Cement, ply, wires, paint and hardware, delivered to your site.",
    type: "website",
    siteName: "Vertical Express",
    locale: "en_IN",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vertical Express — Building material, on site today",
    description:
      "Construction materials for contractors and homeowners in Srinagar. Cement, ply, wires, paint and hardware, delivered to your site.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  icons: {
    icon: "/logo-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} antialiased`}>
        <SiteJsonLd siteUrl={process.env.NEXT_PUBLIC_SITE_URL || "https://www.verticalexpress.in"} />
        {/* Skip to main content — accessibility / keyboard nav */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999] focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-extrabold focus:text-ink focus:shadow-lg"
        >
          Skip to main content
        </a>
        <SmoothScrollProvider>
          <CartProvider>
            <NativeShellProvider>{children}</NativeShellProvider>
          </CartProvider>
        </SmoothScrollProvider>

        {/*
          Nothing third-party goes here.

          Two <script> tags used to sit at this spot — static.rocket.new's
          rocket-web.js and rocket-shot.js — injected by a scaffolding tool and
          carried in on the merge with main (f897094). They pointed at
          appanalytics.rocket.new and loaded on every page, checkout included.

          Our CSP blocked them, which is why nobody noticed. That is the wrong
          thing to rely on: the policy already carries a deliberate wildcard for
          Razorpay, and the next person to widen script-src turns them back on.
          A script in the checkout DOM can read the delivery address, the phone
          number, the basket and the totals — card entry is inside Razorpay's
          iframe, but everything around it is ours. None of that appears in the
          privacy page's list of what we collect, because nobody chose to send
          it anywhere.

          Analytics belongs behind PostHog, which is configured, consented to
          and named in the privacy policy.
        */}
      </body>
    </html>
  );
}
