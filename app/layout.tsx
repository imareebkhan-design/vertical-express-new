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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001"),
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} antialiased`}>
        {/* Skip to main content — accessibility / keyboard nav */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999] focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-extrabold focus:text-ink focus:shadow-lg"
        >
          Skip to main content
        </a>
        <SmoothScrollProvider>
          <CartProvider>
            <NativeShellProvider>{children}</NativeShellProvider>
          </CartProvider>
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
