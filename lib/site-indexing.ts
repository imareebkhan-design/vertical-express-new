/**
 * Only the production storefront may be indexed by search engines.
 *
 * Staging (and any preview) used to ship `robots.txt` "Allow: /", a sitemap and
 * `<meta name="robots" content="index, follow">`, so a search engine could index
 * a test copy of the shop — including the synthetic QA TEST ITEM — under a
 * hosted.app URL. Found in staging acceptance, 10 Oct 2026.
 *
 * Decided by the site's own configured URL (NEXT_PUBLIC_SITE_URL, available at
 * build and runtime), so a staging deploy cannot become indexable by accident:
 * the production host has to be named. Unset means the app's existing default,
 * the production URL. Relative import only — next.config.ts loads this file.
 */
export const PRODUCTION_SITE_HOSTS: ReadonlySet<string> = new Set(["www.verticalexpress.in", "verticalexpress.in"]);
const DEFAULT_SITE_URL = "https://www.verticalexpress.in";

export function siteIsIndexable(siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): boolean {
  try {
    return PRODUCTION_SITE_HOSTS.has(new URL(siteUrl || DEFAULT_SITE_URL).hostname);
  } catch {
    return false;
  }
}
