/**
 * The "back to orders" target from `?back=`. Only an Orders list URL is
 * accepted — never another path, host or scheme (an open redirect would let a
 * crafted link send an operator anywhere). Pure.
 */
export function safeOrdersBack(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || v.length > 1000) return "/admin/orders";
  if (v !== "/admin/orders" && !v.startsWith("/admin/orders?")) return "/admin/orders";
  if (/[\\\s]|\/\//.test(v)) return "/admin/orders";
  return v;
}
