import type { Metadata } from "next";
import { ContentPage } from "@/components/sections/content-page";
import { CONTENT } from "@/lib/content";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description: "Delivery, payment and orders at Vertical Express, Srinagar.",
};

export default function Page() {
  return <ContentPage {...CONTENT["faq"]} />;
}
