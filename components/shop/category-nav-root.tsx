import "server-only";
import { connection } from "next/server";
import { listCategoryDirectory } from "@/lib/services/catalog";
import { categoryNavOrEmpty } from "@/lib/category-nav";
import { log } from "@/lib/observability";
import { CategoryNavProvider } from "./category-nav-provider";

/**
 * Reads the category directory once per request and hands the navigation to
 * the client (components/shop/category-nav-provider.tsx).
 *
 * `connection()` keeps this per request. Without it a statically rendered page
 * (the content pages) would carry the navigation as it was at build time, and
 * a category switched off afterwards would stay linked there — on every
 * instance that never saw the revalidation.
 *
 * If the directory cannot be read, the page still renders with no category
 * links (logged), rather than failing or falling back to a fixed list that may
 * name hidden categories. The page's own data will fail loudly if the database
 * is really down.
 */
export async function CategoryNavRoot({ children }: { children: React.ReactNode }) {
  await connection();
  const nav = await categoryNavOrEmpty(listCategoryDirectory, (error) =>
    log("ERROR", {
      service: "catalog",
      event: "category_nav_unavailable",
      metadata: { message: error instanceof Error ? error.message : String(error) },
    }),
  );
  return <CategoryNavProvider nav={nav}>{children}</CategoryNavProvider>;
}
