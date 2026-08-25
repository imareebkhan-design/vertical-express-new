import type { Metadata } from "next";
import { ContentPage } from "@/components/sections/content-page";
import { CONTENT } from "@/lib/content";

export const metadata: Metadata = {
  title: "How we work | Vertical Express",
  description: "Everything on this page is a process you can check rather than a claim you have to believe. Where something is not settled, it says so.",
};

export default function Page() {
  return <ContentPage {...CONTENT["how-we-work"]} />;
}
