import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://verticalexpress.dev";

  // Static routes
  const routes = ["", "/categories", "/services"].map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: route === "" ? 1.0 : 0.8,
  }));

  try {
    // Dynamic Categories
    const categories = await db.category.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    });

    const categoryRoutes = categories.map((c) => ({
      url: `${siteUrl}/category/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    // Dynamic Products
    const products = await db.product.findMany({
      where: { status: "published" },
      select: { slug: true, updatedAt: true },
    });

    const productRoutes = products.map((p) => ({
      url: `${siteUrl}/product/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    return [...routes, ...categoryRoutes, ...productRoutes];
  } catch (error) {
    console.error("Failed to generate dynamic sitemap routes:", error);
    return routes;
  }
}
