import type { Metadata } from "next";
import { ContentPage } from "@/components/sections/content-page";
import { CONTENT } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact us | Vertical Express",
  description: "We are open 8am to 8pm, all days.",
};

export default function Page() {
  return <ContentPage {...CONTENT["contact"]} />;
}
