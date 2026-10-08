import type { Metadata } from "next";
import { ContentPage } from "@/components/sections/content-page";
import { CONTENT } from "@/lib/content";

export const metadata: Metadata = {
  title: "How we work",
  description: "How Vertical Express delivers building materials across Srinagar: store dispatch for small goods, truck delivery for heavy material.",
};

export default function Page() {
  return <ContentPage {...CONTENT["how-we-work"]} />;
}
