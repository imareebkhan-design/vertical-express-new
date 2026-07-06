"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Product } from "@/lib/data";

interface CartLine {
  product: Product;
  qty: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  total: number;
  add: (product: Product, qty: number) => void;
  lastAdded: Product | null;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [lastAdded, setLastAdded] = useState<Product | null>(null);

  const add = useCallback((product: Product, qty: number) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, qty: l.qty + qty } : l
        );
      }
      return [...prev, { product, qty }];
    });
    setLastAdded(product);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((sum, l) => sum + l.qty, 0);
    const total = lines.reduce((sum, l) => sum + l.qty * l.product.price, 0);
    return { lines, count, total, add, lastAdded };
  }, [lines, add, lastAdded]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
