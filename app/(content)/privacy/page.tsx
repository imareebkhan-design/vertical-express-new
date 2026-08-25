import type { Metadata } from "next";
import { ContentPage } from "@/components/sections/content-page";
import { CONTENT } from "@/lib/content";

export const metadata: Metadata = {
  title: "Privacy policy | Vertical Express",
  description: "What we collect, why, and what we do not do with it.",
};

export default function Page() {
  return <ContentPage {...CONTENT["privacy"]} />;
}
