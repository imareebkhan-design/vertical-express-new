/**
 * In-app "Back" that behaves like the phone's own back button (issue #26).
 *
 * Two bugs this replaces:
 *
 * - The category screen's arrow did `router.push("/categories")`. That ADDS a
 *   history entry, so Home → Tiling → (arrow) → Categories → (system back)
 *   lands on Tiling again: the arrow and the phone's back button disagreed and
 *   the stack grew a loop.
 * - The product screen's arrow did `router.back()` unconditionally. Opened from
 *   a shared link (WhatsApp, a cold start of the app shell, a new tab) there is
 *   no in-app page behind it, so the arrow did nothing or left the site.
 *
 * The rule: if this tab has navigated inside the app at least once, Back pops
 * real history. Otherwise (the page was entered directly) it REPLACES the page
 * with its logical parent, so a later system back still leaves cleanly instead
 * of bouncing between the two.
 *
 * Pure and dependency-free; the tracker and hook that feed it live in
 * hooks/use-back-or.ts.
 */

export type BackAction = { kind: "history" } | { kind: "replace"; href: string };

/** What an in-app Back press should do, given how deep this tab is in the app. */
export function backAction(depth: number, fallback: string): BackAction {
  return depth > 0 ? { kind: "history" } : { kind: "replace", href: safeFallback(fallback) };
}

/**
 * The depth after a route change. A change caused by the browser's own
 * back/forward (popstate) unwinds one level; any other change is a push.
 * Forward after back is counted as a pop too: under-counting only ever sends
 * the user to the logical parent, never off the site.
 */
export function nextDepth(depth: number, causedByPopstate: boolean): number {
  return causedByPopstate ? Math.max(0, depth - 1) : depth + 1;
}

/** Only same-site paths: a fallback is never another host or scheme. */
export function safeFallback(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//") || /[\\\s]/.test(href)) return "/";
  return href;
}
