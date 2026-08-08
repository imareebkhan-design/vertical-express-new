/**
  * Navigation route definitions & types for Vertical Express native mobile shell.
  */

export type RootTabRoute = "home" | "categories" | "search" | "cart" | "account";

export interface NavigationTab {
  id: RootTabRoute;
  label: string;
  iconName: "home" | "grid" | "search" | "shopping-cart" | "user";
  href: string;
}

export const MAIN_TABS: NavigationTab[] = [
  { id: "home", label: "Home", iconName: "home", href: "/" },
  { id: "categories", label: "Categories", iconName: "grid", href: "/categories" },
  { id: "search", label: "Search", iconName: "search", href: "/search" },
  { id: "cart", label: "Cart", iconName: "shopping-cart", href: "/cart" },
  { id: "account", label: "Account", iconName: "user", href: "/account" },
];

export interface DeepLinkPayload {
  scheme: string;
  host: string;
  path: string;
  params: Record<string, string>;
}
