"use client";

import { createContext, useContext } from "react";
import { EMPTY_CATEGORY_NAV, type CategoryNav } from "@/lib/category-nav";

/**
 * The category navigation, as the client sees it (lib/category-nav.ts).
 *
 * Set once in the root layout from the category directory. Without the
 * provider, or when the directory could not be read, the navigation lists no
 * categories — never a hardcoded set, which is what used to lead to 404s when
 * a category was switched off. "All categories" links stay, so nobody is left
 * without a way in.
 */
const CategoryNavContext = createContext<CategoryNav>(EMPTY_CATEGORY_NAV);

export function CategoryNavProvider({ nav, children }: { nav: CategoryNav; children: React.ReactNode }) {
  return <CategoryNavContext.Provider value={nav}>{children}</CategoryNavContext.Provider>;
}

export function useCategoryNav(): CategoryNav {
  return useContext(CategoryNavContext);
}
