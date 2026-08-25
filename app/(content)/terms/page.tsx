import type { Metadata } from "next";
import { ContentPage } from "@/components/sections/content-page";
import { CONTENT } from "@/lib/content";

export const metadata: Metadata = {
  title: "Terms of service | Vertical Express",
  description: "These terms cover orders placed on verticalexpress.in. Our services business operates separately at verticalconstruction.in under its own terms.",
};

export default function Page() {
  return <ContentPage {...CONTENT["terms"]} />;
}
