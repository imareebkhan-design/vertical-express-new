"use client";

import { getCart, addToCart, updateCartItem, removeCartItem } from "@/actions/cart";
import { getMyWishlistIds } from "@/actions/wishlist";
import { CartStateProvider } from "@/components/shop/cart-provider";

export { useCart } from "@/components/shop/cart-provider";
const actions = { getCart, addToCart, updateCartItem, removeCartItem, getMyWishlistIds };

export function CartProvider({ children }: { children: React.ReactNode }) {
  return <CartStateProvider actions={actions}>{children}</CartStateProvider>;
}
