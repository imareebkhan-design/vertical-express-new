import type { Metadata } from "next";
import { ContentPage } from "@/components/sections/content-page";
import { CONTENT } from "@/lib/content";

export const metadata: Metadata = {
  title: "Questions we actually get | Vertical Express",
  description: "If an answer is not settled yet, it says so rather than guessing.",
};

export default function Page() {
  return <ContentPage {...CONTENT["faq"]} />;
}
