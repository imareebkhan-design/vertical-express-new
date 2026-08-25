import type { Metadata } from "next";
import { ContentPage } from "@/components/sections/content-page";
import { CONTENT } from "@/lib/content";

export const metadata: Metadata = {
  title: "Shipping and delivery | Vertical Express",
  description: "Two kinds of goods travel two different ways, and every product page tells you which it is. We do not put a single delivery promise in the header, because ",
};

export default function Page() {
  return <ContentPage {...CONTENT["shipping"]} />;
}
