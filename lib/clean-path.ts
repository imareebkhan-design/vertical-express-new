/**
 * Paths copied out of a sentence often carry its punctuation: a terminal or chat
 * app links "…/admin/catalogue-approvals." including the full stop, and the page
 * 404s (owner, 10 Oct). No route here ends in punctuation, so a page request
 * whose path does is redirected to the same path without it.
 *
 * Returns the cleaned path, or null when nothing should change. API routes are
 * never touched (a client must get the status of the exact path it asked for).
 */
export function cleanTrailingPunctuation(pathname: string): string | null {
  if (pathname.startsWith("/api/")) return null;
  const cleaned = pathname.replace(/[.,;:!)\]'"]+$/, "");
  if (cleaned === pathname || cleaned === "" ) return null;
  return cleaned;
}
