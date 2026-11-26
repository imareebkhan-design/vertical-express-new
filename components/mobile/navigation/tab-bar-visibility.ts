/** Pages that carry the floating pill nav on a phone. */
const PRIMARY_TABS = ["/", "/categories", "/search", "/cart", "/account"];

/**
 * Whether the floating tab bar is shown.
 *
 * A cart with items has its own fixed Checkout bar in the same place, and the
 * approved Cart artboard replaces the nav with that bar. Showing both put the
 * nav on top of the total and the Checkout button (staging, 4 Oct 2026). An
 * empty cart has no bar, so it keeps the nav as its way out.
 */
export function showsTabBar(pathname: string, isMobile: boolean, cartHasItems: boolean): boolean {
  if (!isMobile || !PRIMARY_TABS.includes(pathname)) return false;
  return !(pathname === "/cart" && cartHasItems);
}
