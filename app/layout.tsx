import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SmoothScrollProvider } from "@/hooks/use-lenis";
import { CartProvider } from "@/hooks/use-cart";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001"),
  title: "Cement, Ply, Hardware & Painting Srinagar | 60 Min Delivery | Vertical Express",
  description:
    "Vertical Express delivers construction materials, hardware and home-improvement supplies across Srinagar in 60 minutes. Cement, tiling, plywood, wires, paint and more — genuine brands at trade prices.",
  keywords: [
    "construction materials",
    "cement delivery",
    "hardware store Srinagar",
    "60 minute delivery",
  ],
  openGraph: {
    title: "Vertical Express — Construction materials in 60 minutes",
    description:
      "Cement, ply, hardware & painting supplies delivered across Srinagar in 60 minutes.",
    type: "website",
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
      <body className={`${inter.variable} antialiased`}>
        {/* Skip to main content — accessibility / keyboard nav */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999] focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-extrabold focus:text-ink focus:shadow-lg"
        >
          Skip to main content
        </a>
        <SmoothScrollProvider>
          <CartProvider>{children}</CartProvider>
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
