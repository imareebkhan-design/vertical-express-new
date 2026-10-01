import { cache } from "react";
import { getProductBySlug } from "@/lib/services/catalog";

/**
 * The product for this URL, fetched once per request and shared by the layout
 * (which decides 404) and the page (which renders it) — see ./layout.tsx.
 */
export const productForPage = cache((slug: string) => getProductBySlug(slug));
