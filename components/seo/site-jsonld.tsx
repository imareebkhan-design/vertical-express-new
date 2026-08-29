import "server-only";

/**
 * Site-level structured data: Organization and WebSite.
 *
 * Product and BreadcrumbList schema already ship per page. What was missing is
 * the site-level pair Google uses to attach a knowledge panel and a sitelinks
 * search box to the domain — the two that matter most for a single-city
 * commerce site competing on local intent.
 *
 * Deliberately NOT emitted here:
 *   - LocalBusiness / openingHours / address — these need a real registered
 *     address and trading hours. Both are still bracketed placeholders in the
 *     policy pages, and inventing them would be a false claim to Google.
 *   - aggregateRating — there is no Review model, so no rating could be earned.
 */
export function SiteJsonLd({ siteUrl }: { siteUrl: string }) {
  const graph = [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Vertical Express",
      url: siteUrl,
      logo: `${siteUrl}/logo.png`,
      areaServed: { "@type": "City", name: "Srinagar" },
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "Vertical Express",
      publisher: { "@id": `${siteUrl}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteUrl}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
      }}
    />
  );
}
