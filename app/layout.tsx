import type { Metadata } from "next";
import { Karla } from "next/font/google";
import "./globals.css";
import { SmoothScrollProvider } from "@/hooks/use-lenis";
import { CartProvider } from "@/hooks/use-cart";

const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
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
      <body className={`${karla.variable} antialiased`}>
        <SmoothScrollProvider>
          <CartProvider>{children}</CartProvider>
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
