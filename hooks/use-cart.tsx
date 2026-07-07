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
import { getCart, addToCart, updateCartItem, removeCartItem } from "@/actions/cart";
import { getMyWishlistIds } from "@/actions/wishlist";
import type { CartSummary } from "@/lib/services/cart";

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
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = useState<CartSummary>(EMPTY_SUMMARY);
  const [optimisticCount, setOptimisticCount] = useState<number | null>(null);
  const [lastAddedTitle, setLastAddedTitle] = useState<string | null>(null);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const lastAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const refresh = useCallback(async () => {
    const s = await getCart();
    setSummary(s);
    setOptimisticCount(null);
  }, []);

  useEffect(() => {
    void refresh();
    void getMyWishlistIds().then((ids) => setWishlistIds(new Set(ids)));
  }, [refresh]);

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
      setOptimisticCount((c) => (c ?? summary.count) + qty);
      if (title) {
        setLastAddedTitle(title);
        if (lastAddedTimer.current) clearTimeout(lastAddedTimer.current);
        lastAddedTimer.current = setTimeout(() => setLastAddedTitle(null), 2500);
      }
      const result = await addToCart({ variantId, qty });
      if (result.ok) {
        setSummary(result.data);
        setOptimisticCount(null);
        return true;
      }
      // rollback
      setOptimisticCount(null);
      await refresh();
      return false;
    },
    [summary.count, refresh]
  );

  const updateItem = useCallback(async (itemId: string, qty: number) => {
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
          const result = await updateCartItem({ itemId, qty: clamped });
          if (result.ok) setSummary(result.data);
        });
      }, 400)
    );
  }, []);

  const removeItem = useCallback(async (itemId: string) => {
    setSummary((prev) => {
      const lines = prev.lines.filter((l) => l.itemId !== itemId);
      return { ...prev, lines, count: lines.reduce((s, l) => s + l.qty, 0) };
    });
    startTransition(async () => {
      const result = await removeCartItem({ itemId });
      if (result.ok) setSummary(result.data);
    });
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      summary,
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
    [summary, optimisticCount, pending, lastAddedTitle, addItem, updateItem, removeItem, refresh, wishlistIds, setWishlisted]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
