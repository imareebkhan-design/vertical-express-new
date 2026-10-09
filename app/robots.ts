import type { MetadataRoute } from "next";
import { siteIsIndexable } from "@/lib/site-indexing";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.verticalexpress.in";
  /* Staging and previews: crawl nothing, advertise no sitemap. */
  if (!siteIsIndexable(siteUrl)) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/account/", "/checkout/", "/login"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
