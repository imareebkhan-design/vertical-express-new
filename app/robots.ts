import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://verticalexpress.dev";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/account/", "/checkout/", "/login"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
