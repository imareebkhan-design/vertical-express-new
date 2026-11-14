import { cache } from "react";
import { getCategoryBySlug } from "@/lib/services/catalog";

/**
 * The category for this URL, fetched once per request and shared by the layout
 * (which decides 404) and the page (which renders it) — see ./layout.tsx.
 */
export const categoryForPage = cache((slug: string) => getCategoryBySlug(slug));
