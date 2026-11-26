/**
 * What a cart screen shows before the cart has loaded — never "Your cart is
 * empty", which on a slow connection read as a lost cart (W-B1-G2).
 */
export function CartLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading your cart" className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="flex gap-4 rounded-card border border-hairline-border bg-white p-4 shadow-card">
          <div className="size-20 shrink-0 animate-pulse rounded-panel bg-surface" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-surface" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface" />
            <div className="h-4 w-20 animate-pulse rounded bg-surface" />
          </div>
        </div>
      ))}
    </div>
  );
}
