import type { Metadata } from "next";
import { ContentPage } from "@/components/sections/content-page";
import { CONTENT } from "@/lib/content";

export const metadata: Metadata = {
  title: "Returns and refunds | Vertical Express",
  description: "Construction material is not a category where one blanket returns window makes sense. A sealed box of tiles and an opened bag of cement are different produ",
};

export default function Page() {
  return <ContentPage {...CONTENT["refunds"]} />;
}
