import { notFound } from "next/navigation";
import { productForPage } from "./data";

/**
 * Decides "does this product exist" before anything is sent (W-16).
 *
 * `loading.tsx` wraps the page in a Suspense boundary, so the shell — and the
 * HTTP status — went out before the page could call `notFound()`: an unknown
 * slug returned the not-found UI with status 200. A layout renders outside
 * that boundary, so a miss here is a real 404 while the page keeps its
 * skeleton. Measured on a production build (see docs/WEB_APP_AUDIT.md).
 */
export default async function ProductSlugLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await productForPage(slug))) notFound();
  return children;
}
