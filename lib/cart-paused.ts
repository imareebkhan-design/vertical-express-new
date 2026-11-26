/**
 * Where the shared cart provider stays quiet: the operations console shows no
 * cart, so it reads none (`paused` in components/shop/cart-provider.tsx).
 */
export function cartPausedOn(pathname: string | null): boolean {
  return pathname === "/admin" || Boolean(pathname?.startsWith("/admin/"));
}
