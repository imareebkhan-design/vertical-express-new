"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { CartSummary } from "@/lib/services/cart";
import { onAuthChanged } from "@/lib/auth/auth-events";

const EMPTY_SUMMARY: CartSummary = {
  cartId: null,
  lines: [],
  count: 0,
  subtotalPaise: 0,
  freeDeliveryThresholdPaise: 50000,
  freeDeliveryRemainingPaise: 50000,
  qualifiesFreeDelivery: false,
};

interface CartContextValue {
  summary: CartSummary;
  /**
   * False until the first server answer (or failure). Before it, `summary` is
   * the empty placeholder — not an empty cart — so a screen that says "Your
   * cart is empty" on it told customers on slow 4G their cart was gone for
   * 1–3 s (W-B1-G2).
   */
  loaded: boolean;
  count: number;
  pending: boolean;
  lastAddedTitle: string | null;
  addItem: (variantId: string, qty: number, title?: string) => Promise<boolean>;
  updateItem: (itemId: string, qty: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Wishlist product ids for the signed-in user (empty for guests). */
  wishlistIds: Set<string>;
  setWishlisted: (productId: string, added: boolean) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Server-backed cart. Initial state hydrates from the DB; mutations call
 *  server actions and reconcile with the authoritative returned summary. */
export interface CartActions {
  getCart: typeof import("@/actions/cart").getCart;
  addToCart: typeof import("@/actions/cart").addToCart;
  updateCartItem: typeof import("@/actions/cart").updateCartItem;
  removeCartItem: typeof import("@/actions/cart").removeCartItem;
  getMyWishlistIds: typeof import("@/actions/wishlist").getMyWishlistIds;
}

export function CartStateProvider({ children, actions }: { children: React.ReactNode; actions: CartActions }) {
  const { getCart, addToCart, updateCartItem, removeCartItem, getMyWishlistIds } = actions;
  const [summary, setSummary] = useState<CartSummary>(EMPTY_SUMMARY);
  const [loaded, setLoaded] = useState(false);
  const [optimisticCount, setOptimisticCount] = useState<number | null>(null);
  const [lastAddedTitle, setLastAddedTitle] = useState<string | null>(null);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const lastAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const identity = useRef(0);
  const cartRequest = useRef(0);
  const wishlistRequest = useRef(0);
  /* Cart writes awaiting the server. An answer that is no longer the newest is
     not shown — but it may carry a write the newest answer did not see, so once
     the last write is back the cart is read again (E8: two quick changes, or a
     change racing a tab-refresh, cannot leave a line on screen that the server
     no longer holds). */
  const writes = useRef(0);

  /* `loaded` goes false only when the customer changes (sign-in/out): then the
     summary on screen is nobody's. A re-read or a quantity change keeps the
     current lines on screen — turning it off there replaced the cart, and its
     stepper, with a skeleton on every tap. */
  const refresh = useCallback(async () => {
    const request = ++cartRequest.current;
    const owner = identity.current;
    try {
      const s = await getCart();
      if (owner !== identity.current || request !== cartRequest.current) return;
      setSummary(s);
      setOptimisticCount(null);
      setLoaded(true);
    } catch {
      /* Nothing changes: after a sign-in/out `loaded` is already false, so
         checkout stays blocked until an authoritative read succeeds, and the
         previous customer's cart is never resurrected; otherwise the last
         authoritative cart stays on screen. */
    }
  }, [getCart]);

  /* After a write's answer: show it if it is the newest; if not, and no other
     write is still out, read the cart once so the screen matches the server. */
  const settleWrite = useCallback((owner: number, request: number, apply: () => void) => {
    if (owner !== identity.current) return;
    if (request === cartRequest.current) apply();
    else if (writes.current === 0) void refresh();
  }, [refresh]);

  const refreshWishlist = useCallback(async () => {
    const owner = identity.current;
    const request = ++wishlistRequest.current;
    try {
      const ids = await getMyWishlistIds();
      if (owner === identity.current && request === wishlistRequest.current) setWishlistIds(new Set(ids));
    } catch { /* A wishlist outage must not restore a previous identity. */ }
  }, [getMyWishlistIds]);

  useEffect(() => {
    void refresh();
    void refreshWishlist();
  }, [refresh, refreshWishlist]);

  /* E8: the cart belongs to whoever is signed in. After sign-in (the guest cart
     merged) or sign-out, re-fetch rather than keep the previous customer's
     lines on screen; and when the tab is shown again, pick up changes made in
     another tab instead of showing — and quoting — a cart that has moved on. */
  useEffect(() => {
    const reload = () => {
      identity.current++;
      setSummary(EMPTY_SUMMARY);
      setLoaded(false);
      setOptimisticCount(null);
      setWishlistIds(new Set());
      setLastAddedTitle(null);
      if (lastAddedTimer.current) clearTimeout(lastAddedTimer.current);
      for (const timer of syncTimers.current.values()) clearTimeout(timer);
      syncTimers.current.clear();
      void refresh();
      void refreshWishlist();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    /* Two windows side by side: switching between them fires no
       visibilitychange, only focus. */
    const onFocus = () => void refresh();
    const off = onAuthChanged(reload);
    const timers = syncTimers.current;
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      /* A counter, not a DOM node: bumping it makes every answer still in
         flight for this provider land nowhere. */
      // eslint-disable-next-line react-hooks/exhaustive-deps
      identity.current++;
      if (lastAddedTimer.current) clearTimeout(lastAddedTimer.current);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [refresh, refreshWishlist]);

  const setWishlisted = useCallback((productId: string, added: boolean) => {
    setWishlistIds((prev) => {
      const next = new Set(prev);
      if (added) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }, []);

  const addItem = useCallback(
    async (variantId: string, qty: number, title?: string) => {
      const owner = identity.current;
      const request = ++cartRequest.current;
      setOptimisticCount((c) => (c ?? summary.count) + qty);
      if (title) {
        setLastAddedTitle(title);
        if (lastAddedTimer.current) clearTimeout(lastAddedTimer.current);
        lastAddedTimer.current = setTimeout(() => setLastAddedTitle(null), 2500);
      }
      writes.current++;
      let result: Awaited<ReturnType<typeof addToCart>>;
      try {
        result = await addToCart({ variantId, qty });
      } finally {
        writes.current--;
      }
      if (owner !== identity.current) return false;
      if (result.ok) {
        const data = result.data;
        settleWrite(owner, request, () => {
          setSummary(data);
          setOptimisticCount(null);
          setLoaded(true);
        });
        return true;
      }
      // rollback
      setOptimisticCount(null);
      await refresh();
      return false;
    },
    [summary.count, refresh, addToCart, settleWrite]
  );

  const updateItem = useCallback(async (itemId: string, qty: number) => {
    const owner = identity.current;
    const request = ++cartRequest.current;
    const clamped = Math.max(0, Math.min(999, qty));
    // Optimistic line update (functional → rapid clicks accumulate correctly).
    setSummary((prev) => {
      const lines = prev.lines
        .map((l) =>
          l.itemId === itemId ? { ...l, qty: clamped, lineTotalPaise: l.unitPricePaise * clamped } : l
        )
        .filter((l) => l.qty > 0);
      return { ...prev, lines, count: lines.reduce((s, l) => s + l.qty, 0) };
    });
    // Debounce the server sync so only the final quantity is written, then
    // reconcile with authoritative tier-adjusted pricing from the server.
    const existing = syncTimers.current.get(itemId);
    if (existing) clearTimeout(existing);
    syncTimers.current.set(
      itemId,
      setTimeout(() => {
        syncTimers.current.delete(itemId);
        startTransition(async () => {
          if (owner !== identity.current) return;
          writes.current++;
          let result: Awaited<ReturnType<typeof updateCartItem>>;
          try {
            result = await updateCartItem({ itemId, qty: clamped });
          } finally {
            writes.current--;
          }
          if (!result.ok) {
            if (owner === identity.current) await refresh();
            return;
          }
          const data = result.data.summary;
          settleWrite(owner, request, () => setSummary(data));
        });
      }, 400)
    );
  }, [updateCartItem, refresh, settleWrite]);

  const removeItem = useCallback(async (itemId: string) => {
    const owner = identity.current;
    const request = ++cartRequest.current;
    setSummary((prev) => {
      const lines = prev.lines.filter((l) => l.itemId !== itemId);
      return { ...prev, lines, count: lines.reduce((s, l) => s + l.qty, 0) };
    });
    startTransition(async () => {
      writes.current++;
      let result: Awaited<ReturnType<typeof removeCartItem>>;
      try {
        result = await removeCartItem({ itemId });
      } finally {
        writes.current--;
      }
      if (!result.ok) {
        if (owner === identity.current) await refresh();
        return;
      }
      const data = result.data;
      settleWrite(owner, request, () => setSummary(data));
    });
  }, [removeCartItem, refresh, settleWrite]);

  const value = useMemo<CartContextValue>(
    () => ({
      summary,
      loaded,
      count: optimisticCount ?? summary.count,
      pending,
      lastAddedTitle,
      addItem,
      updateItem,
      removeItem,
      refresh,
      wishlistIds,
      setWishlisted,
    }),
    [summary, loaded, optimisticCount, pending, lastAddedTitle, addItem, updateItem, removeItem, refresh, wishlistIds, setWishlisted]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
