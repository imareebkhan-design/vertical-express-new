/**
  * Navigation route definitions & types for Vertical Express native mobile shell.
  */

export type RootTabRoute = "home" | "categories" | "cart" | "orders" | "account";

export interface NavigationTab {
  id: RootTabRoute;
  label: string;
  iconName: "home" | "grid" | "shopping-cart" | "orders" | "user";
  href: string;
}

/**
 * Home · Categories · Cart · Orders · Account.
 *
 * Search is deliberately not a tab: the app design puts a search affordance in
 * the header of every browse screen, and gives the fifth slot to Orders, which
 * a contractor reorders from. Home is intent — reorders, saved lists, running
 * low; Categories is the only complete taxonomy. The two do not duplicate.
 */
export const MAIN_TABS: NavigationTab[] = [
  { id: "home", label: "Home", iconName: "home", href: "/" },
  { id: "categories", label: "Categories", iconName: "grid", href: "/categories" },
  { id: "cart", label: "Cart", iconName: "shopping-cart", href: "/cart" },
  { id: "orders", label: "Orders", iconName: "orders", href: "/account/orders" },
  { id: "account", label: "Account", iconName: "user", href: "/account" },
];

export interface DeepLinkPayload {
  scheme: string;
  host: string;
  path: string;
  params: Record<string, string>;
}
