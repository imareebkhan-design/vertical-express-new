import type { Metadata } from "next";
import { ContentPage } from "@/components/sections/content-page";
import { CONTENT } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact us",
  /* No hours: the page itself says they are not confirmed yet. */
  description: "How to reach Vertical Express in Srinagar.",
};

export default function Page() {
  return <ContentPage {...CONTENT["contact"]} />;
}
